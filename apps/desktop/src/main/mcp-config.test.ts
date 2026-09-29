import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_MCP_PORT, loadMcpSettings, normalizeMcpSettings, saveMcpSettings } from './mcp-config.ts';

const token = () => 'T'.repeat(43);

test('defaults: enabled, default port, risky tools off, fresh token', () => {
  assert.deepEqual(normalizeMcpSettings(null, token), {
    enabled: true,
    port: DEFAULT_MCP_PORT,
    allowRiskyTools: false,
    token: 'T'.repeat(43),
  });
});

test('keeps valid values and replaces invalid ones', () => {
  const settings = normalizeMcpSettings({ enabled: false, port: 80, allowRiskyTools: true, token: 'short' }, token);
  assert.equal(settings.enabled, false);
  assert.equal(settings.port, DEFAULT_MCP_PORT);
  assert.equal(settings.allowRiskyTools, true);
  assert.equal(settings.token, 'T'.repeat(43));
});

test('load creates the file with owner-only permissions and round-trips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-'));
  const file = path.join(dir, 'mcp.json');
  const first = loadMcpSettings(file, token);
  assert.equal(fs.existsSync(file), true);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  saveMcpSettings(file, { ...first, port: 50000 });
  const second = loadMcpSettings(file, () => 'X'.repeat(43));
  assert.equal(second.port, 50000);
  assert.equal(second.token, first.token);
  fs.rmSync(dir, { recursive: true, force: true });
});
