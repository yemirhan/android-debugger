/**
 * Logic for the stdio <-> HTTP bridge (entry: mcp-bridge.ts). Node built-ins
 * only: the bridge runs outside the app, under system Node or under the app's
 * own binary with ELECTRON_RUN_AS_NODE=1, and is unit tested with node:test.
 *
 * Must NOT be imported by the main process bundle (it would turn into a shared
 * chunk and the bridge would stop being a single self-contained file).
 */
import { createHmac, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const BRIDGE_APP_FOLDER = 'Android Debugger';
export const BRIDGE_CONFIG_FILE = 'mcp.json';

/**
 * Before sending the token, the bridge asks the listener to prove it knows it:
 * the server answers any request carrying a nonce with HMAC(token, nonce).
 * Anything else on the port (another local user squatting it while the app
 * is closed) can't, so it never sees the token. Kept in sync with
 * mcp-security.ts (checked by mcp-bridge.test.ts).
 */
export const BRIDGE_NONCE_HEADER = 'x-android-debugger-nonce';
export const BRIDGE_PROOF_HEADER = 'x-android-debugger-proof';

export function bridgeProof(token: string, nonce: string): string {
  return createHmac('sha256', token).update(`android-debugger-mcp:${nonce}`).digest('base64url');
}

export interface BridgeArgs {
  configPath?: string;
  help: boolean;
}

export function parseBridgeArgs(argv: readonly string[]): BridgeArgs {
  const args: BridgeArgs = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--config') args.configPath = argv[++i];
    else if (arg.startsWith('--config=')) args.configPath = arg.slice('--config='.length);
  }
  return args;
}

/** Where the packaged app keeps mcp.json (Electron's appData + product name). */
export function defaultConfigPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  let appData: string;
  if (platform === 'darwin') appData = path.join(home, 'Library', 'Application Support');
  else if (platform === 'win32') appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  else appData = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(appData, BRIDGE_APP_FOLDER, BRIDGE_CONFIG_FILE);
}

export function resolveConfigPath(args: BridgeArgs, env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
  return args.configPath || env.ANDROID_DEBUGGER_MCP_CONFIG || defaultConfigPath(platform, env, home);
}

export type BridgeConfig = { ok: true; port: number; token: string; enabled: boolean } | { ok: false; message: string };

export function readBridgeConfig(configPath: string): BridgeConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch {
    return {
      ok: false,
      message:
        `Android Debugger's MCP settings were not found at ${configPath}. Open Android Debugger once ` +
        '(Settings → AI assistants (MCP) creates them), or pass --config with the path shown there.',
    };
  }
  try {
    const parsed = JSON.parse(raw) as { port?: unknown; token?: unknown; enabled?: unknown };
    if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string' || !parsed.token) {
      return { ok: false, message: `${configPath} is incomplete. Open Android Debugger to repair it.` };
    }
    return { ok: true, port: parsed.port, token: parsed.token, enabled: parsed.enabled !== false };
  } catch {
    return { ok: false, message: `${configPath} is not valid JSON. Open Android Debugger to repair it.` };
  }
}

/** The `data:` payloads of every event in an SSE body. */
export function parseSseData(body: string): string[] {
  const payloads: string[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''));
    if (data.length) payloads.push(data.join('\n'));
  }
  return payloads;
}

type JsonRpcId = string | number | null;

export function errorResponse(id: JsonRpcId, message: string, code = -32000): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Request ids in a message (or batch); notifications have none. */
export function requestIds(message: unknown): JsonRpcId[] {
  const items = Array.isArray(message) ? message : [message];
  return items
    .filter((item): item is { id: JsonRpcId; method?: unknown } =>
      !!item && typeof item === 'object' && 'id' in item && 'method' in item
    )
    .map((item) => item.id);
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

/**
 * Forwards one stdin line to the app and returns the lines to write to stdout.
 * Failures become JSON-RPC errors for requests (so the assistant sees why)
 * and are dropped for notifications.
 */
export async function forwardLine(
  line: string,
  loadConfig: () => BridgeConfig,
  fetchImpl: FetchLike,
  makeNonce: () => string = () => randomBytes(24).toString('base64url')
): Promise<{ stdout: string[]; stderr: string[] }> {
  const trimmed = line.trim();
  if (!trimmed) return { stdout: [], stderr: [] };
  let message: unknown;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return { stdout: [errorResponse(null, 'Parse error: invalid JSON', -32700)], stderr: [] };
  }
  const ids = requestIds(message);
  const failAll = (text: string) => ({ stdout: ids.map((id) => errorResponse(id, text)), stderr: [text] });

  const config = loadConfig();
  if (!config.ok) return failAll(config.message);
  if (!config.enabled) {
    return failAll('The MCP server is turned off. Turn it on in Android Debugger → Settings → AI assistants (MCP).');
  }

  const url = `http://127.0.0.1:${config.port}/mcp`;
  const unreachable = (error: unknown) => {
    const cause = (error as { cause?: { code?: string } })?.cause?.code;
    return failAll(
      cause === 'ECONNREFUSED'
        ? `Android Debugger is not running (nothing is listening on 127.0.0.1:${config.port}). Open the app and try again.`
        : `Could not reach Android Debugger on 127.0.0.1:${config.port}: ${error instanceof Error ? error.message : String(error)}`
    );
  };

  // Make sure the listener is Android Debugger before handing it the token.
  const nonce = makeNonce();
  let proof: string | null;
  try {
    const probe = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [BRIDGE_NONCE_HEADER]: nonce },
      body: '{}',
    });
    await probe.text().catch(() => '');
    proof = probe.headers.get(BRIDGE_PROOF_HEADER);
  } catch (error) {
    return unreachable(error);
  }
  if (proof !== bridgeProof(config.token, nonce)) {
    return failAll(
      `The program listening on 127.0.0.1:${config.port} is not Android Debugger (or uses a different token), ` +
        'so the bridge did not send it your token. Open Android Debugger and check Settings → AI assistants (MCP): ' +
        'if the port is in use, pick another one.'
    );
  }

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${config.token}`,
      },
      body: trimmed,
    });
  } catch (error) {
    return unreachable(error);
  }

  const body = await response.text();
  if (response.status === 202 || !body.trim()) return { stdout: [], stderr: [] };
  const type = response.headers.get('content-type') ?? '';
  const payloads = type.includes('text/event-stream') ? parseSseData(body) : [body.trim()];

  if (response.status >= 400) {
    // HTTP-level errors carry id null; re-address them to the request.
    let reason = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(payloads[0] ?? '') as { error?: { message?: string } };
      if (parsed.error?.message) reason = parsed.error.message;
    } catch {
      // Keep the status text.
    }
    return failAll(reason);
  }
  return { stdout: payloads.map((payload) => payload.replace(/\r?\n/g, ' ')), stderr: [] };
}

export const BRIDGE_HELP = `Android Debugger MCP bridge (stdio <-> http://127.0.0.1:<port>/mcp)

Usage: node android-debugger-mcp.js [--config <path to mcp.json>]
   or: ELECTRON_RUN_AS_NODE=1 "<Android Debugger executable>" android-debugger-mcp.js [--config <path>]

Reads the port and token from Android Debugger's mcp.json, so no secret goes
into your assistant's config. Android Debugger must be running.
Config lookup: --config, then $ANDROID_DEBUGGER_MCP_CONFIG, then the app's
default settings folder.
`;
