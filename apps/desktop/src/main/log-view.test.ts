import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOG_FILTER,
  FilteredRowsCache,
  compileLogFilter,
  firstIndexAfter,
  formatLogLine,
  shortTime,
  topTags,
  type LogFilter,
  type LogRow,
} from '../renderer/lib/log-filter.ts';
import { createLogStore } from '../renderer/lib/log-store.ts';
import type { LogLine } from './logcat-format.ts';

let n = 0;
function line(partial: Partial<LogLine> = {}): LogLine {
  n++;
  return {
    id: `t${n}`,
    timestamp: '2026-09-29 11:20:17.453',
    epochMs: 1_000_000 + n,
    level: 'I',
    tag: 'Tag',
    message: `message ${n}`,
    pid: 1,
    tid: 1,
    ...partial,
  };
}
const rowsOf = (lines: LogLine[], start = 1): LogRow[] => lines.map((l, i) => ({ ...l, seq: start + i }));
const filter = (patch: Partial<LogFilter>) => compileLogFilter({ ...DEFAULT_LOG_FILTER, ...patch });

test('filters by minimum level, tags and case-insensitive search', () => {
  const rows = rowsOf([
    line({ level: 'D', tag: 'A', message: 'debug hello' }),
    line({ level: 'W', tag: 'B', message: 'Warn HELLO' }),
    line({ level: 'E', tag: 'C', message: 'boom' }),
  ]);
  assert.deepEqual(rows.filter(filter({ minLevel: 'W' }).test).map((r) => r.tag), ['B', 'C']);
  assert.deepEqual(rows.filter(filter({ search: 'hello' }).test).map((r) => r.tag), ['A', 'B']);
  // Search matches the tag too.
  assert.deepEqual(rows.filter(filter({ search: 'c' }).test).map((r) => r.tag), ['C']);
  assert.deepEqual(rows.filter(filter({ includeTags: ['A', 'C'] }).test).map((r) => r.tag), ['A', 'C']);
  assert.deepEqual(rows.filter(filter({ excludeTags: ['A'] }).test).map((r) => r.tag), ['B', 'C']);
});

test('regex search works and an invalid pattern reports an error instead of throwing', () => {
  const rows = rowsOf([line({ message: 'user 42 logged in' }), line({ message: 'no digits' })]);
  assert.equal(rows.filter(filter({ search: 'user \\d+', regex: true }).test).length, 1);
  const bad = filter({ search: '([a-', regex: true });
  assert.ok(bad.error);
  assert.equal(bad.isActive, false);
  assert.equal(rows.filter(bad.test).length, 2);
  // The same text without regex mode is a plain substring search.
  assert.equal(filter({ search: '([a-' }).error, null);
});

test('filtered cache only filters appended rows and drops evicted ones', () => {
  const cache = new FilteredRowsCache();
  const errors = filter({ minLevel: 'E' });
  let calls = 0;
  const counting = { ...errors, test: (row: LogLine) => (calls++, errors.test(row)) };

  const first = rowsOf([line({ level: 'E' }), line({ level: 'I' }), line({ level: 'E' })]);
  assert.equal(cache.get(first, 0, counting).length, 2);
  assert.equal(calls, 3);

  // Two rows appended, the oldest evicted (ring buffer).
  const appended = rowsOf([line({ level: 'I' }), line({ level: 'E' })], 4);
  const second = first.slice(1).concat(appended);
  calls = 0;
  const result = cache.get(second, 0, counting);
  assert.equal(calls, 2);
  assert.deepEqual(result.map((r) => r.seq), [3, 5]);

  // Same inputs → same array (stable for React).
  assert.equal(cache.get(second, 0, counting), result);
  // A new generation forces a full pass.
  calls = 0;
  cache.get(second, 1, counting);
  assert.equal(calls, 4);
});

test('an inactive filter returns the rows untouched', () => {
  const cache = new FilteredRowsCache();
  const rows = rowsOf([line(), line()]);
  assert.equal(cache.get(rows, 0, filter({})), rows);
});

test('helpers: binary search, top tags, formatting', () => {
  const rows = rowsOf([line(), line(), line()], 10);
  assert.equal(firstIndexAfter(rows, 9), 0);
  assert.equal(firstIndexAfter(rows, 11), 2);
  assert.equal(firstIndexAfter(rows, 99), 3);
  const tagged = rowsOf([line({ tag: 'x' }), line({ tag: 'y' }), line({ tag: 'y' })]);
  assert.deepEqual(topTags(tagged), [{ tag: 'y', count: 2 }, { tag: 'x', count: 1 }]);
  assert.equal(shortTime('2026-09-29 11:20:17.453'), '11:20:17.453');
  assert.equal(
    formatLogLine(line({ pid: 12, tid: 345, level: 'W', tag: 'T', message: 'm' })),
    '2026-09-29 11:20:17.453    12   345 W T: m'
  );
});

const makeStore = (capacity = 5) => createLogStore({ capacity, defaultFilter: DEFAULT_LOG_FILTER });
const target = { deviceId: 'emulator-5554', mode: 'rn' as const, packageName: '' };

test('store keeps a ring buffer of the newest lines and ignores stale sessions', () => {
  const store = makeStore(3);
  const { sessionId } = store.beginSession(target);
  store.receiveBatch({ sessionId: sessionId + 1, entries: [line()], dropped: 0 });
  assert.equal(store.getState().rows.length, 0);

  store.receiveBatch({ sessionId, entries: [line(), line()], dropped: 0 });
  store.receiveBatch({ sessionId, entries: [line(), line()], dropped: 7 });
  const state = store.getState();
  assert.equal(state.rows.length, 3);
  assert.deepEqual(state.rows.map((r) => r.seq), [2, 3, 4]);
  assert.equal(state.received, 4);
  assert.equal(state.evicted, 1);
  assert.equal(state.dropped, 7);
});

test('store clears on a new target but keeps lines when the same target restarts', () => {
  const store = makeStore();
  const { sessionId } = store.beginSession(target);
  store.receiveBatch({ sessionId, entries: [line({ epochMs: 5000 })], dropped: 0 });
  store.endSession('no-device', undefined, { resumeOnReturn: true });

  const again = store.beginSession(target);
  assert.equal(store.getState().rows.length, 1);
  assert.equal(again.resumeAfterEpochMs, 5000);

  // A user-initiated restart of the same target starts from "now".
  store.endSession('stopped');
  assert.equal(store.beginSession(target).resumeAfterEpochMs, undefined);

  store.beginSession({ ...target, mode: 'device' });
  assert.equal(store.getState().rows.length, 0);
});

test('history is prepended before streamed lines and moves coverage back', () => {
  const store = makeStore(10);
  const { sessionId } = store.beginSession(target);
  store.receiveStatus({ sessionId, state: 'streaming', sinceEpochMs: 9000 });
  assert.equal(store.getState().coverageStartEpochMs, 9000);
  store.receiveBatch({ sessionId, entries: [line({ message: 'live' })], dropped: 0 });
  const generation = store.getState().generation;
  store.prependHistory([line({ message: 'old1', epochMs: 100 }), line({ message: 'old2', epochMs: 200 })]);
  const state = store.getState();
  assert.deepEqual(state.rows.map((r) => r.message), ['old1', 'old2', 'live']);
  assert.ok(state.rows[0].seq < state.rows[1].seq && state.rows[1].seq < state.rows[2].seq);
  assert.equal(state.coverageStartEpochMs, 100);
  assert.equal(state.history, 'loaded');
  assert.ok(state.generation > generation);

  store.prependHistory([]);
  assert.equal(store.getState().history, 'empty');
  store.prependHistory([], 'boom');
  assert.equal(store.getState().historyMessage, 'boom');
});

test('pause freezes the visible rows while new lines keep arriving', () => {
  const store = makeStore(10);
  const { sessionId } = store.beginSession(target);
  store.receiveBatch({ sessionId, entries: [line()], dropped: 0 });
  store.setPaused(true);
  store.receiveBatch({ sessionId, entries: [line(), line()], dropped: 0 });
  const state = store.getState();
  assert.equal(state.frozenRows?.length, 1);
  assert.equal(state.rows.length, 3);
  store.setPaused(false);
  assert.equal(store.getState().frozenRows, null);
});

test('lowering capacity trims the oldest lines; ended streams stop accepting batches', () => {
  const store = makeStore(10);
  const { sessionId } = store.beginSession(target);
  store.receiveBatch({ sessionId, entries: [line(), line(), line(), line()], dropped: 0 });
  store.setCapacity(2);
  assert.deepEqual(store.getState().rows.map((r) => r.seq).length, 2);
  store.receiveStatus({ sessionId, state: 'ended', message: 'device offline' });
  assert.equal(store.getState().status, 'ended');
  assert.equal(store.getConsecutiveEnds(), 1);
  store.receiveBatch({ sessionId, entries: [line()], dropped: 0 });
  assert.equal(store.getState().rows.length, 2);
});
