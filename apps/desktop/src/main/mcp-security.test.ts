import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkMcpRequest,
  checkSavePath,
  generateMcpToken,
  hasValidBearer,
  isAllowedHost,
  isAllowedOrigin,
} from './mcp-security.ts';

const PORT = 45321;
const TOKEN = 'a'.repeat(43);

test('host must be loopback with the server port', () => {
  assert.equal(isAllowedHost('127.0.0.1:45321', PORT), true);
  assert.equal(isAllowedHost('localhost:45321', PORT), true);
  assert.equal(isAllowedHost('LOCALHOST:45321', PORT), true);
  assert.equal(isAllowedHost('127.0.0.1', PORT), false);
  assert.equal(isAllowedHost('127.0.0.1:8080', PORT), false);
  assert.equal(isAllowedHost('evil.example:45321', PORT), false);
  assert.equal(isAllowedHost('127.0.0.1.evil.example:45321', PORT), false);
  assert.equal(isAllowedHost(undefined, PORT), false);
});

test('origin is optional but must be this server when present', () => {
  assert.equal(isAllowedOrigin(undefined, PORT), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:45321', PORT), true);
  assert.equal(isAllowedOrigin('http://localhost:45321', PORT), true);
  assert.equal(isAllowedOrigin('https://evil.example', PORT), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', PORT), false);
  assert.equal(isAllowedOrigin('null', PORT), false);
});

test('bearer token is compared exactly', () => {
  assert.equal(hasValidBearer(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(hasValidBearer(`bearer ${TOKEN}`, TOKEN), true);
  assert.equal(hasValidBearer(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(hasValidBearer(TOKEN, TOKEN), false);
  assert.equal(hasValidBearer(undefined, TOKEN), false);
  assert.equal(hasValidBearer('Bearer ', TOKEN), false);
});

test('checkMcpRequest orders host, origin, then token', () => {
  const expected = { port: PORT, token: TOKEN };
  const auth = `Bearer ${TOKEN}`;
  assert.deepEqual(checkMcpRequest({ host: '127.0.0.1:45321', authorization: auth }, expected), { ok: true });
  const badHost = checkMcpRequest({ host: 'rebind.example:45321', authorization: auth }, expected);
  assert.equal(badHost.ok, false);
  assert.equal(!badHost.ok && badHost.status, 403);
  const badOrigin = checkMcpRequest({ host: '127.0.0.1:45321', origin: 'https://evil.example', authorization: auth }, expected);
  assert.equal(!badOrigin.ok && badOrigin.status, 403);
  const noToken = checkMcpRequest({ host: '127.0.0.1:45321' }, expected);
  assert.equal(!noToken.ok && noToken.status, 401);
});

test('generated tokens are long and unique', () => {
  const a = generateMcpToken();
  const b = generateMcpToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test('save paths stay in the captures folder unless risky tools are on, and never overwrite', () => {
  const captures = '/Users/me/Pictures/Android Debugger';
  const existing = new Set([`${captures}/old.png`, '/Users/me/Pictures/important.png']);
  const opts = (riskyAllowed: boolean) => ({ riskyAllowed, exists: (p: string) => existing.has(p), settingsHint: 'Settings' });

  assert.deepEqual(checkSavePath(`${captures}/new.png`, '.png', captures, opts(false)), { ok: true, path: `${captures}/new.png` });
  assert.deepEqual(checkSavePath(`${captures}/sub/new.PNG`, '.png', captures, opts(false)), {
    ok: true,
    path: `${captures}/sub/new.PNG`,
  });

  // Overwriting is refused even with risky tools on.
  assert.equal(checkSavePath(`${captures}/old.png`, '.png', captures, opts(true)).ok, false);
  assert.equal(checkSavePath('/Users/me/Pictures/important.png', '.png', captures, opts(true)).ok, false);
  // Escaping the folder needs risky tools.
  assert.equal(checkSavePath('/Users/me/Desktop/shot.png', '.png', captures, opts(false)).ok, false);
  assert.equal(checkSavePath(`${captures}/../../Desktop/shot.png`, '.png', captures, opts(false)).ok, false);
  assert.equal(checkSavePath(`${captures} evil/shot.png`, '.png', captures, opts(false)).ok, false);
  assert.deepEqual(checkSavePath('/Users/me/Desktop/shot.png', '.png', captures, opts(true)), {
    ok: true,
    path: '/Users/me/Desktop/shot.png',
  });
  // Shape checks.
  assert.equal(checkSavePath('relative/shot.png', '.png', captures, opts(true)).ok, false);
  assert.equal(checkSavePath(`${captures}/clip.mov`, '.mp4', captures, opts(true)).ok, false);
});
