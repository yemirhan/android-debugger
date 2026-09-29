/**
 * MCP server settings, persisted as `mcp.json` in the app's userData folder.
 * The stdio bridge (mcp-bridge.ts) reads the same file for the port and token,
 * so users never have to paste the secret into their assistant's config.
 *
 * Node built-ins only (no electron, no relative imports) so it can be unit
 * tested with node:test.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const MCP_CONFIG_FILE = 'mcp.json';
export const DEFAULT_MCP_PORT = 45321;
export const MCP_PATH = '/mcp';
/** Unprivileged ports only. */
export const MCP_PORT_MIN = 1024;
export const MCP_PORT_MAX = 65535;

export interface McpSettings {
  enabled: boolean;
  port: number;
  /** Gates run_shell, uninstall_app, clear_app_data and install_app. */
  allowRiskyTools: boolean;
  token: string;
}

export function isValidMcpPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MCP_PORT_MIN && value <= MCP_PORT_MAX;
}

function isValidToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

/** Fills in defaults for anything missing or malformed. */
export function normalizeMcpSettings(raw: unknown, makeToken: () => string): McpSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    port: isValidMcpPort(source.port) ? source.port : DEFAULT_MCP_PORT,
    allowRiskyTools: typeof source.allowRiskyTools === 'boolean' ? source.allowRiskyTools : false,
    token: isValidToken(source.token) ? source.token : makeToken(),
  };
}

export function mcpConfigPath(userDataDir: string): string {
  return path.join(userDataDir, MCP_CONFIG_FILE);
}

/** Reads (and, when missing or incomplete, creates) the settings file. */
export function loadMcpSettings(configPath: string, makeToken: () => string): McpSettings {
  let raw: unknown = null;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    // Missing or corrupt: start from defaults.
  }
  const settings = normalizeMcpSettings(raw, makeToken);
  if (JSON.stringify(raw) !== JSON.stringify(serialize(settings))) saveMcpSettings(configPath, settings);
  return settings;
}

function serialize(settings: McpSettings) {
  return {
    enabled: settings.enabled,
    port: settings.port,
    allowRiskyTools: settings.allowRiskyTools,
    token: settings.token,
  };
}

/** Writes atomically, readable by the current user only (it holds the token). */
export function saveMcpSettings(configPath: string, settings: McpSettings): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(serialize(settings), null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, configPath);
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // Best-effort on filesystems without POSIX modes.
  }
}

export function mcpUrl(port: number): string {
  return `http://127.0.0.1:${port}${MCP_PATH}`;
}
