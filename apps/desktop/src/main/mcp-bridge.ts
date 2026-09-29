/**
 * Stdio <-> HTTP bridge for MCP clients that prefer launching a command.
 * Built to out/main/mcp-bridge.js and shipped as
 * Resources/mcp/android-debugger-mcp.js (see package.json extraResources).
 *
 * Every JSON-RPC line on stdin is POSTed to Android Debugger's local server;
 * responses go to stdout. Port and token are re-read for each message, so a
 * regenerated token or a changed port just works.
 */
import * as os from 'node:os';
import * as readline from 'node:readline';
import {
  BRIDGE_HELP,
  forwardLine,
  parseBridgeArgs,
  readBridgeConfig,
  resolveConfigPath,
  type FetchLike,
} from './mcp-bridge-core';

function main(): void {
  const args = parseBridgeArgs(process.argv.slice(2));
  if (args.help) {
    process.stderr.write(BRIDGE_HELP);
    return;
  }
  const configPath = resolveConfigPath(args, process.env, process.platform, os.homedir());
  const fetchImpl = globalThis.fetch as unknown as FetchLike;
  if (typeof fetchImpl !== 'function') {
    process.stderr.write('This bridge needs Node.js 18 or newer (global fetch).\n');
    process.exit(1);
  }

  const pending = new Set<Promise<void>>();
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', (line) => {
    const task = forwardLine(line, () => readBridgeConfig(configPath), fetchImpl)
      .then(({ stdout, stderr }) => {
        for (const text of stderr) process.stderr.write(`[android-debugger-mcp] ${text}\n`);
        for (const text of stdout) process.stdout.write(`${text}\n`);
      })
      .catch((error: unknown) => {
        process.stderr.write(`[android-debugger-mcp] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  input.on('close', () => {
    void Promise.allSettled([...pending]).then(() => process.exit(0));
  });
}

main();
