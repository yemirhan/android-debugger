import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMcpGuides, shellQuote } from '../renderer/lib/mcp-setup.ts';

const packaged = {
  url: 'http://127.0.0.1:45321/mcp',
  token: 'secret',
  setup: {
    runtimePath: '/Applications/Android Debugger.app/Contents/MacOS/Android Debugger',
    bridgePath: '/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js',
    configPath: '/Users/me/Library/Application Support/Android Debugger/mcp.json',
    configIsDefault: true,
    bridgeExists: true,
  },
};

function snippet(id: string, input = packaged) {
  const found = buildMcpGuides(input).flatMap((guide) => guide.snippets).find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

test('shellQuote leaves simple words and escapes the rest', () => {
  assert.equal(shellQuote('/usr/bin/node'), '/usr/bin/node');
  assert.equal(shellQuote('/a b/c'), '"/a b/c"');
  assert.equal(shellQuote('a"$`\\'), '"a\\"\\$\\`\\\\"');
});

test('Claude Code commands', () => {
  assert.equal(
    snippet('claude-bridge').code,
    'claude mcp add --scope user android-debugger -e ELECTRON_RUN_AS_NODE=1 -- ' +
      '"/Applications/Android Debugger.app/Contents/MacOS/Android Debugger" ' +
      '"/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js"'
  );
  assert.equal(
    snippet('claude-http').code,
    'claude mcp add --scope user --transport http android-debugger http://127.0.0.1:45321/mcp --header "Authorization: Bearer secret"'
  );
  assert.equal(snippet('claude-bridge').containsToken, false);
});

test('Codex config and commands', () => {
  assert.match(snippet('codex-bridge').code, /^codex mcp add android-debugger --env ELECTRON_RUN_AS_NODE=1 -- "/);
  assert.equal(
    snippet('codex-toml').code,
    [
      '[mcp_servers.android-debugger]',
      'command = "/Applications/Android Debugger.app/Contents/MacOS/Android Debugger"',
      'args = ["/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js"]',
      'env = { ELECTRON_RUN_AS_NODE = "1" }',
    ].join('\n')
  );
  assert.match(snippet('codex-http').code, /--bearer-token-env-var ANDROID_DEBUGGER_MCP_TOKEN$/);
});

test('a non-default profile passes --config to the bridge', () => {
  const custom = { ...packaged, setup: { ...packaged.setup, configIsDefault: false, configPath: '/tmp/p/mcp.json' } };
  assert.match(snippet('claude-bridge', custom).code, / --config \/tmp\/p\/mcp\.json$/);
  const json = JSON.parse(snippet('json-bridge', custom).code);
  assert.deepEqual(json.mcpServers['android-debugger'].args.slice(1), ['--config', '/tmp/p/mcp.json']);
});
