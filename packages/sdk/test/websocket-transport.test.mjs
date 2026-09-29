import assert from 'node:assert/strict';
import test from 'node:test';

// The transport captures the global WebSocket when the module loads, so the
// fake must be installed before importing the bundle.
class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    FakeWebSocket.instances.push(this);
  }

  send(data) {
    if (this.readyState !== 1) throw new Error('INVALID_STATE_ERR');
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  // Test helpers acting as the desktop app
  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  welcome() {
    this.onmessage?.({ data: JSON.stringify({ type: 'welcome', protocol: 1 }) });
  }

  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

globalThis.WebSocket = FakeWebSocket;
const { WebSocketTransport, AndroidDebugger } = await import('../dist/index.mjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (n) => ({ type: 'custom', timestamp: n, payload: { name: `event-${n}`, data: {}, timestamp: n } });
const batches = (socket) => socket.sent.filter((frame) => frame.type === 'batch');
const sentNames = (socket) => batches(socket).flatMap((frame) => frame.messages.map((m) => m.payload.name ?? m.payload.args?.[0]));
const latestSocket = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

test('queues messages until the desktop app answers the handshake', async (t) => {
  const transport = new WebSocketTransport({ port: 9999 });
  t.after(() => transport.destroy());
  const socket = latestSocket();
  assert.equal(socket.url, 'ws://localhost:9999');

  transport.send(message(1));
  socket.open();
  transport.send(message(2));
  await sleep(80);

  assert.equal(socket.sent.length, 1, 'only the hello frame goes out before welcome');
  assert.equal(socket.sent[0].type, 'hello');
  assert.equal(socket.sent[0].protocol, 1);
  assert.equal(typeof socket.sent[0].sessionId, 'string');
  assert.equal(transport.isConnected(), false);

  const changes = [];
  transport.onConnectionChange((connected) => changes.push(connected));
  socket.welcome();
  assert.equal(transport.isConnected(), true);
  assert.deepEqual(changes, [true]);
  assert.deepEqual(sentNames(socket), ['event-1', 'event-2']);

  transport.send(message(3));
  transport.send(message(4));
  await sleep(80);
  assert.deepEqual(batches(socket).at(-1).messages.map((m) => m.payload.name), ['event-3', 'event-4'], 'batched');
});

test('never writes to the console', async (t) => {
  const calls = [];
  const originals = {};
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[level] = console[level];
    console[level] = (...args) => calls.push([level, ...args]);
  }
  t.after(() => Object.assign(console, originals));

  const transport = new WebSocketTransport();
  const socket = latestSocket();
  socket.open();
  socket.welcome();
  transport.send(message(1));
  socket.drop();
  transport.send(message(2));
  transport.destroy();
  await sleep(80);
  assert.deepEqual(calls, []);
});

test('reconnects after a disconnect and delivers what was queued meanwhile', async (t) => {
  const transport = new WebSocketTransport();
  t.after(() => transport.destroy());
  const changes = [];
  transport.onConnectionChange((connected) => changes.push(connected));
  const first = latestSocket();
  first.open();
  first.welcome();

  first.drop();
  assert.equal(transport.isConnected(), false);
  transport.send(message(1));

  await sleep(600);
  const second = latestSocket();
  assert.notEqual(second, first, 'opened a new socket');
  second.open();
  second.welcome();
  assert.deepEqual(changes, [true, false, true]);
  assert.deepEqual(sentNames(second), ['event-1']);
});

test('keeps the newest messages when the queue overflows and reports the drop', async (t) => {
  const transport = new WebSocketTransport({ maxQueueSize: 2 });
  t.after(() => transport.destroy());
  for (let i = 1; i <= 5; i++) transport.send(message(i));
  const socket = latestSocket();
  socket.open();
  socket.welcome();

  const names = sentNames(socket);
  assert.match(names[0], /3 earlier messages were dropped/);
  assert.deepEqual(names.slice(1), ['event-4', 'event-5']);
});

test('serializes cycles, errors and BigInts at send time', async (t) => {
  const transport = new WebSocketTransport();
  t.after(() => transport.destroy());
  const socket = latestSocket();
  socket.open();
  socket.welcome();

  const state = { count: 1n, error: new TypeError('boom'), shared: { a: 1 } };
  state.self = state;
  state.again = state.shared;
  transport.send({ type: 'state', timestamp: 1, payload: { name: 'test', state, timestamp: 1 } });
  state.shared.a = 2; // later mutations must not leak into the captured snapshot
  await sleep(80);

  const sent = batches(socket)[0].messages[0].payload.state;
  assert.equal(sent.count, '1n');
  assert.equal(sent.self, '[Circular]');
  assert.deepEqual(sent.again, { a: 1 }, 'repeated (non-circular) references are kept');
  assert.equal(sent.error.name, 'TypeError');
  assert.equal(sent.error.message, 'boom');
});

test('AndroidDebugger reports connection changes and survives destroy/init', async () => {
  const changes = [];
  const unsubscribe = AndroidDebugger.onConnectionChange((connected) => changes.push(connected));
  AndroidDebugger.init({ interceptConsole: false, interceptNetwork: false });
  const socket = latestSocket();
  socket.open();
  socket.welcome();
  assert.equal(AndroidDebugger.isConnected(), true);

  AndroidDebugger.trackEvent('hello', { a: 1 });
  await sleep(80);
  assert.deepEqual(sentNames(socket), ['hello']);

  AndroidDebugger.destroy();
  assert.equal(AndroidDebugger.isConnected(), false);
  assert.deepEqual(changes, [true, false]);
  unsubscribe();
});

test('AndroidDebugger.onMessage delivers snapshots without looping on listeners that log', async () => {
  const seen = [];
  const unsubscribe = AndroidDebugger.onMessage((message) => {
    seen.push(message);
    console.log('listener saw', message.type); // would recurse without the guard
  });
  AndroidDebugger.init({ interceptConsole: true, interceptNetwork: false });
  const data = { count: 1 };
  AndroidDebugger.trackEvent('tap', data);
  data.count = 2;

  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'custom');
  assert.equal(seen[0].payload.data.count, 1, 'snapshot taken at capture time');

  AndroidDebugger.destroy();
  unsubscribe();
  AndroidDebugger.trackEvent('after-destroy');
  assert.equal(seen.length, 1);
});

test('network interception ignores React Native dev tooling requests to Metro', async () => {
  const seen = [];
  const unsubscribe = AndroidDebugger.onMessage((message) => seen.push(message));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
  // Node has no XMLHttpRequest; the interceptor patches its prototype.
  const hadXhr = 'XMLHttpRequest' in globalThis;
  if (!hadXhr) globalThis.XMLHttpRequest = class { open() {} send() {} };
  AndroidDebugger.init({ interceptConsole: false, interceptNetwork: true });
  try {
    await fetch('http://10.0.2.2:8081/symbolicate', { method: 'POST', body: '{}' });
    await fetch('http://localhost:8081/open-stack-frame', { method: 'POST' });
    await fetch('https://api.example.com/symbolicate-report');
    await sleep(10);
  } finally {
    AndroidDebugger.destroy();
    globalThis.fetch = realFetch;
    if (!hadXhr) delete globalThis.XMLHttpRequest;
    unsubscribe();
  }
  const urls = [...new Set(seen.filter((m) => m.type === 'network').map((m) => m.payload.url))];
  assert.deepEqual(urls, ['https://api.example.com/symbolicate-report']);
});
