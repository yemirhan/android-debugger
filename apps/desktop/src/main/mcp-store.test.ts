import assert from 'node:assert/strict';
import test from 'node:test';
import type { LogLine } from './logcat-format.ts';
import { McpDataStore, parseSince, queryLogLines, queryNetworkRequests, summarizeSeries } from './mcp-store.ts';

function line(partial: Partial<LogLine>): LogLine {
  return { id: '1', timestamp: '2026-09-29 10:00:00.000', epochMs: 1000, level: 'I', tag: 'App', message: 'hello', ...partial };
}

test('log stream: batches of the current session are kept, a new target starts empty', () => {
  const store = new McpDataStore();
  store.beginLogStream({ sessionId: 1, deviceId: 'emu', mode: 'app', packageName: 'com.a' });
  store.receiveLogBatch({ sessionId: 1, entries: [line({ message: 'one' })], dropped: 0 });
  store.receiveLogBatch({ sessionId: 99, entries: [line({ message: 'stale' })], dropped: 0 });
  assert.deepEqual(store.getLiveLogs().lines.map((entry) => entry.message), ['one']);

  // Same target (e.g. a resume) keeps lines; another app clears them.
  store.beginLogStream({ sessionId: 2, deviceId: 'emu', mode: 'app', packageName: 'com.a' });
  assert.equal(store.getLiveLogs().lines.length, 1);
  store.beginLogStream({ sessionId: 3, deviceId: 'emu', mode: 'app', packageName: 'com.b' });
  assert.equal(store.getLiveLogs().lines.length, 0);
  store.receiveLogStatus({ sessionId: 3, state: 'streaming' });
  assert.equal(store.getLiveLogs().state, 'streaming');
});

test('queryLogLines filters by level, tags, search, regex and time and keeps the newest', () => {
  const lines = [
    line({ level: 'D', tag: 'Net', message: 'GET /a', epochMs: 1000 }),
    line({ level: 'E', tag: 'Net', message: 'GET /b failed', epochMs: 2000 }),
    line({ level: 'W', tag: 'UI', message: 'slow frame', epochMs: 3000 }),
    line({ level: 'E', tag: 'UI', message: 'crash soon', epochMs: 4000 }),
  ];
  assert.equal(queryLogLines(lines, { minLevel: 'W', limit: 10 }).matched, 3);
  assert.deepEqual(queryLogLines(lines, { tags: ['net'], limit: 10 }).lines.map((l) => l.message), ['GET /a', 'GET /b failed']);
  assert.equal(queryLogLines(lines, { excludeTags: ['UI'], limit: 10 }).matched, 2);
  assert.equal(queryLogLines(lines, { search: 'FAILED', limit: 10 }).matched, 1);
  assert.equal(queryLogLines(lines, { search: '^GET /[ab]$', regex: true, limit: 10 }).matched, 1);
  assert.equal(queryLogLines(lines, { sinceEpochMs: 2500, limit: 10 }).matched, 2);
  const limited = queryLogLines(lines, { limit: 1 });
  assert.equal(limited.matched, 4);
  assert.deepEqual(limited.lines.map((l) => l.message), ['crash soon']);
  assert.throws(() => queryLogLines(lines, { search: '(', regex: true, limit: 1 }), /Invalid regular expression/);
  // Tags are searched too.
  assert.equal(queryLogLines(lines, { search: '^ui$', regex: true, limit: 10 }).matched, 2);
});

test('queryLogLines stops a catastrophically backtracking regex instead of hanging', () => {
  const lines = [line({ message: `${'a'.repeat(40)}b` })];
  const started = Date.now();
  assert.throws(
    () => queryLogLines(lines, { search: '(a+)+$', regex: true, limit: 10 }, { regexTimeoutMs: 100 }),
    /took too long/
  );
  assert.ok(Date.now() - started < 2000);
});

test('parseSince understands relative, ISO and epoch values', () => {
  const now = 1_000_000_000_000;
  assert.equal(parseSince(undefined, now), null);
  assert.equal(parseSince('30s', now), now - 30_000);
  assert.equal(parseSince('5m', now), now - 300_000);
  assert.equal(parseSince('2h', now), now - 7_200_000);
  assert.equal(parseSince('2026-09-29T10:00:00Z', now), Date.parse('2026-09-29T10:00:00Z'));
  assert.equal(parseSince('1790000000000', now), 1790000000000);
  assert.throws(() => parseSince('yesterday-ish', now), /since/);
});

test('SDK messages: network upserts by id, zustand and state snapshots keep the latest', () => {
  const store = new McpDataStore();
  store.setSdkTarget('emu', 'com.a');
  store.addSdkMessages([
    { type: 'network', timestamp: 1, payload: { id: 'r1', url: 'https://x/a', method: 'GET', headers: {}, timestamp: 1 } },
    { type: 'network', timestamp: 2, payload: { id: 'r1', url: 'https://x/a', method: 'GET', headers: {}, timestamp: 1, status: 500 } },
    { type: 'console', timestamp: 3, payload: { level: 'warn', args: ['careful', { a: 1 }], timestamp: 3 } },
    { type: 'zustand', timestamp: 4, payload: { name: 'cart', state: { items: 1 }, timestamp: 4 } },
    { type: 'zustand', timestamp: 5, payload: { name: 'cart', state: { items: 2 }, timestamp: 5 } },
  ]);
  assert.equal(store.network.values().length, 1);
  assert.equal(store.network.values()[0].status, 500);
  assert.equal(store.console.toArray()[0].message, 'careful {"a":1}');
  assert.deepEqual(store.states.values().map((s) => s.state), [{ items: 2 }]);

  // Switching apps clears SDK data; restarting the same stream keeps it.
  store.setSdkTarget('emu', 'com.a');
  assert.equal(store.network.values().length, 1);
  store.setSdkTarget('emu', 'com.b');
  assert.equal(store.network.values().length, 0);
});

test('queryNetworkRequests filters by status and truncates bodies', () => {
  const requests = [
    { id: '1', url: 'https://api/x', method: 'GET', headers: {}, timestamp: 1, status: 200 },
    { id: '2', url: 'https://api/y', method: 'POST', headers: {}, timestamp: 2, status: 503, responseBody: 'x'.repeat(50) },
    { id: '3', url: 'https://api/z', method: 'GET', headers: {}, timestamp: 3 },
  ];
  assert.deepEqual(queryNetworkRequests(requests, { status: 'failed', limit: 10 }).requests.map((r) => r.id), ['2']);
  assert.deepEqual(queryNetworkRequests(requests, { status: 'pending', limit: 10 }).requests.map((r) => r.id), ['3']);
  const withBodies = queryNetworkRequests(requests, { method: 'post', includeBodies: true, maxBodyChars: 10, limit: 10 });
  assert.match(String((withBodies.requests[0] as { responseBody?: string }).responseBody), /^x{10}… \[truncated 40/);
});

test('monitor samples are per target and summarized', () => {
  const store = new McpDataStore();
  store.addMonitorSample('cpu', 'emu', 'com.a', { usage: 10 }, 1);
  store.addMonitorSample('cpu', 'emu', 'com.a', { usage: 30 }, 2);
  assert.equal(store.getMonitorSamples('cpu', 'emu', 'com.a').length, 2);
  assert.equal(store.getMonitorSamples('cpu', 'emu', 'com.b').length, 0);
  store.addMonitorSample('battery', 'emu', '', { level: 80 }, 3);
  assert.equal(store.getMonitorSamples('battery', 'emu', 'com.a').length, 1);
  assert.deepEqual(summarizeSeries([10, 30, NaN]), { latest: 30, min: 10, max: 30, avg: 20, samples: 2 });
  assert.equal(summarizeSeries([]), null);
});
