/**
 * Request checks for the local MCP server. Pure (node:crypto only) so they can
 * be unit tested with node:test.
 *
 * The server binds to 127.0.0.1 only, and every request must also:
 *  - name a loopback Host (blocks DNS rebinding: a web page that resolves its
 *    own domain to 127.0.0.1 still sends its domain as the Host),
 *  - carry no Origin, or a loopback one (blocks browsers on other sites),
 *  - present the per-install bearer token.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as path from 'node:path';

export interface McpRequestHeaders {
  host?: string;
  origin?: string;
  authorization?: string;
}

export type McpRequestCheck = { ok: true } | { ok: false; status: 401 | 403; message: string };

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

/** Accepts "127.0.0.1:<port>" and "localhost:<port>" (case-insensitive), nothing else. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const match = /^([^:]+):(\d+)$/.exec(host.trim().toLowerCase());
  if (!match) return false;
  return LOOPBACK_HOSTNAMES.has(match[1]) && Number(match[2]) === port;
}

/** No Origin (CLI clients) is fine; a browser Origin must be this server itself. */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (origin === undefined || origin === '') return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname) && Number(url.port) === port;
  } catch {
    return false;
  }
}

/** Constant-time comparison of "Bearer <token>" against the expected token. */
export function hasValidBearer(authorization: string | undefined, token: string): boolean {
  if (!authorization || !token) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  if (!match) return false;
  const given = Buffer.from(match[1], 'utf8');
  const expected = Buffer.from(token, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function checkMcpRequest(headers: McpRequestHeaders, expected: { port: number; token: string }): McpRequestCheck {
  if (!isAllowedHost(headers.host, expected.port)) {
    return { ok: false, status: 403, message: `Forbidden host. Connect to http://127.0.0.1:${expected.port}/mcp.` };
  }
  if (!isAllowedOrigin(headers.origin, expected.port)) {
    return { ok: false, status: 403, message: 'Forbidden origin. Browser pages cannot use this server.' };
  }
  if (!hasValidBearer(headers.authorization, expected.token)) {
    return {
      ok: false,
      status: 401,
      message:
        'Missing or wrong bearer token. Copy the current token from Android Debugger → Settings → AI assistants (MCP), ' +
        'or use the bundled stdio bridge, which reads it for you.',
    };
  }
  return { ok: true };
}

/**
 * Lets the stdio bridge check it is talking to this app before it sends the
 * token: any request with a nonce header gets HMAC(token, nonce) back.
 * Mirrors bridgeProof() in mcp-bridge-core.ts.
 */
export const MCP_NONCE_HEADER = 'x-android-debugger-nonce';
export const MCP_PROOF_HEADER = 'x-android-debugger-proof';

export function mcpServerProof(token: string, nonce: unknown): string | null {
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return null;
  return createHmac('sha256', token).update(`android-debugger-mcp:${nonce}`).digest('base64url');
}

/** 32 random bytes as URL-safe base64 (43 characters). */
export function generateMcpToken(): string {
  return randomBytes(32).toString('base64url');
}

export type SavePathCheck = { ok: true; path: string } | { ok: false; message: string };

/**
 * Validates a tool-supplied save location (screenshots, recordings). The text
 * an assistant reads from the device (logs, network bodies) is untrusted, so a
 * custom path may never replace an existing file, and writing outside the
 * captures folder counts as a risky action.
 */
export function checkSavePath(
  savePath: string,
  extension: string,
  capturesDir: string,
  options: { riskyAllowed: boolean; exists: (filePath: string) => boolean; settingsHint: string }
): SavePathCheck {
  if (!path.isAbsolute(savePath) || !savePath.toLowerCase().endsWith(extension)) {
    return { ok: false, message: `savePath must be an absolute path ending in ${extension}.` };
  }
  const resolved = path.resolve(savePath);
  if (options.exists(resolved)) {
    return { ok: false, message: `${resolved} already exists. Choose a new file name; existing files are never overwritten.` };
  }
  const relative = path.relative(path.resolve(capturesDir), resolved);
  const insideCaptures = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!insideCaptures && !options.riskyAllowed) {
    return {
      ok: false,
      message:
        `Saving outside the captures folder (${capturesDir}) needs "Allow risky tools" in ${options.settingsHint}. ` +
        'Leave savePath out to save in the captures folder.',
    };
  }
  return { ok: true, path: resolved };
}
