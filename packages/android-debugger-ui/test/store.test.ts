import assert from 'node:assert/strict';
import test from 'node:test';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import { DEBUGGER_DATA_LIMITS, DebuggerStore, debuggerStore } from '../src/store.ts';
import {
  formatConsoleArgs,
  formatDuration,
  requestState,
  splitUrl,
  toCurl,
  tryParseJson,
} from '../src/format.ts';

const network = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'network' as const,
  timestamp: 1,
  payload: { id, url: `https://api.example.com/${id}`, method: 'GET', headers: {}, timestamp: 1, ...extra },
});
const log = (text: string, level = 'log') => ({
  type: 'console' as const,
  timestamp: 1,
  payload: { level, args: [text], timestamp: 1 },
});

test('network completions replace their start in place', () => {
  const store = new DebuggerStore();
  store.add(network('a'));
  store.add(network('b'));
  store.add(network('a', { status: 200, duration: 12 }));
  store.flush();
  const { network: requests } = store.getSnapshot();
  assert.deepEqual(requests.map((r) => r.id), ['a', 'b']);
  assert.equal(requests[0].status, 200);
});

test('batches notify once and keep snapshots immutable', () => {
  const store = new DebuggerStore();
  let notifications = 0;
  store.subscribe(() => notifications++);
  const before = store.getSnapshot();
  for (let i = 0; i < 50; i++) store.add(log(`line ${i}`));
  assert.equal(store.getSnapshot(), before, 'nothing changes until the flush');
  store.flush();
  assert.equal(notifications, 1);
  assert.equal(store.getSnapshot().console.length, 50);
  assert.equal(before.console.length, 0, 'previous snapshot untouched');
  assert.equal(store.getSnapshot().network, before.network, 'untouched kinds keep their identity');
});

test('keeps only the newest entries per kind', () => {
  const store = new DebuggerStore();
  for (let i = 0; i < DEBUGGER_DATA_LIMITS.console + 20; i++) store.add(log(`line ${i}`));
  for (let i = 0; i < DEBUGGER_DATA_LIMITS.network + 5; i++) store.add(network(`r${i}`));
  store.flush();
  const data = store.getSnapshot();
  assert.equal(data.console.length, DEBUGGER_DATA_LIMITS.console);
  assert.equal(data.console[0].args[0], 'line 20');
  assert.equal(data.network.length, DEBUGGER_DATA_LIMITS.network);
  assert.equal(data.network[0].id, 'r5');
});

test('state snapshots keep the latest value per store, most recent last', () => {
  const store = new DebuggerStore();
  store.add({ type: 'zustand', timestamp: 1, payload: { name: 'cart', state: { items: 1 }, timestamp: 1 } });
  store.add({ type: 'state', timestamp: 2, payload: { name: 'user', state: { id: 7 }, timestamp: 2 } });
  store.add({ type: 'zustand', timestamp: 3, payload: { name: 'cart', state: { items: 2 }, timestamp: 3 } });
  store.flush();
  const { states } = store.getSnapshot();
  assert.deepEqual(states.map((s) => s.key), ['state:user', 'zustand:cart']);
  assert.deepEqual(states[1].state, { items: 2 });
  assert.equal(states[1].updates, 2);
});

test('events include custom events and performance marks; clear() forgets one kind', () => {
  const store = new DebuggerStore();
  store.add({ type: 'custom', timestamp: 1, payload: { name: 'tap', data: { id: 1 }, timestamp: 1 } });
  store.add({ type: 'performance', timestamp: 2, payload: { name: 'load', startTime: 0, duration: 42 } });
  store.add(log('hi'));
  store.flush();
  assert.deepEqual(
    store.getSnapshot().events.map((e) => [e.kind, e.name, e.duration]),
    [['custom', 'tap', undefined], ['performance', 'load', 42]]
  );
  store.clear('events');
  assert.equal(store.getSnapshot().events.length, 0);
  assert.equal(store.getSnapshot().console.length, 1);
});

test('the shared store records what the SDK captures', async (t) => {
  AndroidDebugger.init({ interceptConsole: false, interceptNetwork: false, port: 1 });
  t.after(() => AndroidDebugger.destroy());
  AndroidDebugger.trackEvent('checkout', { total: 9.99 });
  AndroidDebugger.sendState('cart', { items: 3 });
  debuggerStore.flush();
  const data = debuggerStore.getSnapshot();
  assert.equal(data.events.at(-1)?.name, 'checkout');
  assert.deepEqual(data.states.at(-1)?.state, { items: 3 });
});

test('formatters', () => {
  assert.equal(requestState({ id: '1', url: '', method: 'GET', headers: {}, timestamp: 0 }), 'pending');
  assert.equal(requestState({ id: '1', url: '', method: 'GET', headers: {}, timestamp: 0, status: 404 }), 'client-error');
  assert.equal(requestState({ id: '1', url: '', method: 'GET', headers: {}, timestamp: 0, error: 'x' }), 'failed');
  assert.deepEqual(splitUrl('https://api.example.com:8443/v1/users?page=2#top'), { host: 'api.example.com:8443', path: '/v1/users?page=2' });
  assert.deepEqual(splitUrl('https://example.com'), { host: 'example.com', path: '/' });
  assert.deepEqual(splitUrl('/relative'), { host: '', path: '/relative' });
  assert.equal(formatDuration(undefined), '…');
  assert.equal(formatDuration(250), '250 ms');
  assert.equal(formatDuration(1500), '1.50 s');
  assert.equal(formatConsoleArgs(['Loaded', { id: 1 }, 3, null]), 'Loaded {"id":1} 3 null');
  assert.equal(formatConsoleArgs(['Failed:', { name: 'TypeError', message: 'boom', stack: 'TypeError: boom\n  at x' }]), 'Failed: TypeError: boom');
  assert.deepEqual(tryParseJson('{"a":1}'), { ok: true, value: { a: 1 } });
  assert.deepEqual(tryParseJson('hello'), { ok: false });
  assert.equal(
    toCurl({ id: '1', url: 'https://x.dev/a', method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"name":"O'Brien"}`, timestamp: 0 }),
    `curl -X POST 'https://x.dev/a' -H 'content-type: application/json' --data-raw '{"name":"O'\\''Brien"}'`
  );
});
