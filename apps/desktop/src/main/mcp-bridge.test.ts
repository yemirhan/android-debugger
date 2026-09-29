import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultConfigPath,
  forwardLine,
  parseBridgeArgs,
  parseSseData,
  requestIds,
  type BridgeConfig,
  type FetchLike,
} from './mcp-bridge-core.ts';

const config: BridgeConfig = { ok: true, port: 45321, token: 'tok', enabled: true };

function fakeFetch(status: number, body: string, contentType = 'application/json') {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { status, headers: { get: () => contentType }, text: async () => body };
  };
  return { fetchImpl, calls };
}

test('parses --config in both forms', () => {
  assert.equal(parseBridgeArgs(['--config', '/a/mcp.json']).configPath, '/a/mcp.json');
  assert.equal(parseBridgeArgs(['--config=/b/mcp.json']).configPath, '/b/mcp.json');
  assert.equal(parseBridgeArgs(['-h']).help, true);
});

test('default config path matches Electron userData for "Android Debugger"', () => {
  assert.equal(defaultConfigPath('darwin', {}, '/Users/me'), '/Users/me/Library/Application Support/Android Debugger/mcp.json');
  assert.equal(defaultConfigPath('linux', {}, '/home/me'), '/home/me/.config/Android Debugger/mcp.json');
  assert.equal(defaultConfigPath('linux', { XDG_CONFIG_HOME: '/x' }, '/home/me'), '/x/Android Debugger/mcp.json');
});

test('SSE bodies are split into data payloads', () => {
  assert.deepEqual(parseSseData('event: message\ndata: {"a":1}\n\ndata: {"b":2}\n\n'), ['{"a":1}', '{"b":2}']);
});

test('request ids ignore notifications and responses', () => {
  assert.deepEqual(requestIds({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), [1]);
  assert.deepEqual(requestIds({ jsonrpc: '2.0', method: 'notifications/initialized' }), []);
  assert.deepEqual(requestIds([{ id: 'a', method: 'x' }, { method: 'y' }]), ['a']);
});

test('forwards with the bearer token and passes JSON responses through', async () => {
  const { fetchImpl, calls } = fakeFetch(200, '{"jsonrpc":"2.0","id":1,"result":{}}\n');
  const out = await forwardLine('{"jsonrpc":"2.0","id":1,"method":"tools/list"}', () => config, fetchImpl);
  assert.deepEqual(out.stdout, ['{"jsonrpc":"2.0","id":1,"result":{}}']);
  assert.equal(calls[0].url, 'http://127.0.0.1:45321/mcp');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
});

test('notifications (202) produce no output', async () => {
  const { fetchImpl } = fakeFetch(202, '');
  const out = await forwardLine('{"jsonrpc":"2.0","method":"notifications/initialized"}', () => config, fetchImpl);
  assert.deepEqual(out.stdout, []);
});

test('HTTP errors are re-addressed to the request id', async () => {
  const { fetchImpl } = fakeFetch(401, '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Missing or wrong bearer token."},"id":null}');
  const out = await forwardLine('{"jsonrpc":"2.0","id":7,"method":"tools/list"}', () => config, fetchImpl);
  const parsed = JSON.parse(out.stdout[0]);
  assert.equal(parsed.id, 7);
  assert.match(parsed.error.message, /bearer token/);
});

test('an app that is not running gives an actionable error', async () => {
  const fetchImpl: FetchLike = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  };
  const out = await forwardLine('{"jsonrpc":"2.0","id":2,"method":"tools/list"}', () => config, fetchImpl);
  assert.match(JSON.parse(out.stdout[0]).error.message, /not running/);
});

test('disabled server and missing config are reported per request', async () => {
  const { fetchImpl, calls } = fakeFetch(200, '{}');
  const disabled = await forwardLine('{"jsonrpc":"2.0","id":3,"method":"x"}', () => ({ ...config, enabled: false }), fetchImpl);
  assert.match(JSON.parse(disabled.stdout[0]).error.message, /turned off/);
  const missing = await forwardLine('{"jsonrpc":"2.0","id":4,"method":"x"}', () => ({ ok: false, message: 'nope' }), fetchImpl);
  assert.equal(JSON.parse(missing.stdout[0]).error.message, 'nope');
  assert.equal(calls.length, 0);
});
