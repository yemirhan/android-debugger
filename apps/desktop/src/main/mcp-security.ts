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
import { randomBytes, timingSafeEqual } from 'node:crypto';

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

/** 32 random bytes as URL-safe base64 (43 characters). */
export function generateMcpToken(): string {
  return randomBytes(32).toString('base64url');
}
