import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import type { SdkBridgeClient, SdkMessage } from '@android-debugger/shared';
import {
  CLOSE_HANDSHAKE_FAILED,
  CLOSE_UNSUPPORTED_PROTOCOL,
  SdkBridgeServer,
  isAllowedSdkOrigin,
  parseSdkFrame,
  reverseListMapsPort,
} from './sdk-bridge-server.ts';

const hello = { type: 'hello', protocol: 1, sdkVersion: '2.0.0', sessionId: 'abcd1234', startedAt: 1 };
const custom = (name: string): SdkMessage => ({ type: 'custom', timestamp: 1, payload: { name, data: {}, timestamp: 1 } });

async function startServer(overrides: { handshakeTimeoutMs?: number } = {}) {
  const received: SdkMessage[] = [];
  const clientChanges: SdkBridgeClient[][] = [];
  const server = await SdkBridgeServer.listen({
    protocolVersion: 1,
    onMessages: (messages) => received.push(...messages),
    onClientsChanged: (clients) => clientChanges.push(clients),
    ...overrides,
  });
  return { server, received, clientChanges };
}

function connect(port: number, origin?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

const nextMessage = (socket: WebSocket) =>
  new Promise<unknown>((resolve) => socket.once('message', (data) => resolve(JSON.parse(data.toString()))));
const closeCode = (socket: WebSocket) => new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(condition(), 'condition was not met in time');
};

test('SDK bridge welcomes a hello, then forwards batches in order', async (t) => {
  const { server, received, clientChanges } = await startServer();
  t.after(() => server.close());
  const socket = await connect(server.port, 'http://localhost:8347');

  const welcome = nextMessage(socket);
  socket.send(JSON.stringify(hello));
  assert.deepEqual(await welcome, { type: 'welcome', protocol: 1 });
  assert.equal(server.clients.length, 1);
  assert.equal(server.clients[0].sdkVersion, '2.0.0');
  assert.equal(server.clients[0].sessionId, 'abcd1234');

  socket.send(JSON.stringify({ type: 'batch', messages: [custom('a'), custom('b')] }));
  socket.send(JSON.stringify({ type: 'batch', messages: [custom('c')] }));
  await waitFor(() => received.length === 3);
  assert.deepEqual(received.map((m) => (m.payload as { name: string }).name), ['a', 'b', 'c']);

  const closed = closeCode(socket);
  socket.close();
  await closed;
  await waitFor(() => clientChanges.length === 2);
  assert.deepEqual(clientChanges.at(-1), []);
});

test('SDK bridge closes connections that do not start with a hello', async (t) => {
  const { server, received } = await startServer({ handshakeTimeoutMs: 50 });
  t.after(() => server.close());

  const eager = await connect(server.port);
  const eagerClosed = closeCode(eager);
  eager.send(JSON.stringify({ type: 'batch', messages: [custom('x')] }));
  assert.equal(await eagerClosed, CLOSE_HANDSHAKE_FAILED);

  const silent = await connect(server.port);
  assert.equal(await closeCode(silent), CLOSE_HANDSHAKE_FAILED);
  assert.equal(received.length, 0);
});

test('SDK bridge rejects other protocol versions', async (t) => {
  const { server } = await startServer();
  t.after(() => server.close());
  const socket = await connect(server.port);
  const closed = closeCode(socket);
  socket.send(JSON.stringify({ ...hello, protocol: 99 }));
  assert.equal(await closed, CLOSE_UNSUPPORTED_PROTOCOL);
  assert.equal(server.clients.length, 0);
});

test('SDK bridge refuses browser pages but accepts native and loopback origins', async (t) => {
  const { server } = await startServer();
  t.after(() => server.close());
  await assert.rejects(connect(server.port, 'https://evil.example'));
  (await connect(server.port)).close();
  (await connect(server.port, 'http://127.0.0.1:8347')).close();

  assert.equal(isAllowedSdkOrigin(undefined), true);
  assert.equal(isAllowedSdkOrigin('http://localhost:8347'), true);
  assert.equal(isAllowedSdkOrigin('http://[::1]:8347'), true);
  assert.equal(isAllowedSdkOrigin('http://localhost.evil.example'), false);
  assert.equal(isAllowedSdkOrigin('file://'), false);
  assert.equal(isAllowedSdkOrigin('not a url'), false);
});

test('SDK bridge closing disconnects apps', async () => {
  const { server } = await startServer();
  const socket = await connect(server.port);
  const welcome = nextMessage(socket);
  socket.send(JSON.stringify(hello));
  await welcome;
  const closed = closeCode(socket);
  await server.close();
  assert.equal(await closed, 1001);
});

test('parseSdkFrame drops malformed and unknown batch messages', () => {
  assert.equal(parseSdkFrame('not json'), null);
  assert.equal(parseSdkFrame('{"type":"hello"}'), null);
  assert.equal(parseSdkFrame('{"type":"mystery"}'), null);
  const frame = parseSdkFrame(
    JSON.stringify({
      type: 'batch',
      messages: [custom('ok'), { type: 'from-the-future', timestamp: 1, payload: {} }, { type: 'custom' }, null],
    })
  );
  assert.equal(frame?.type, 'batch');
  assert.equal(frame?.type === 'batch' && frame.messages.length, 1);
});

test('reverseListMapsPort matches only the exact device and host ports', () => {
  const list = 'emulator-5554 tcp:8347 tcp:51234\nUsbFfs tcp:8081 tcp:8081\n';
  assert.equal(reverseListMapsPort(list, 8347, 51234), true);
  assert.equal(reverseListMapsPort(list, 8347, 51235), false);
  assert.equal(reverseListMapsPort('host-19 tcp:8347 tcp:51234', 8347, 51234), true);
  assert.equal(reverseListMapsPort('', 8347, 51234), false);
});
