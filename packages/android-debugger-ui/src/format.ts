import type { NetworkRequest } from '@android-debugger/shared';

// Pure helpers (no React Native imports) so they can be unit tested in Node.

export type RequestState = 'pending' | 'success' | 'redirect' | 'client-error' | 'server-error' | 'failed';

export function requestState(request: NetworkRequest): RequestState {
  if (request.error) return 'failed';
  const { status } = request;
  if (status === undefined) return request.duration === undefined ? 'pending' : 'success';
  if (status >= 500) return 'server-error';
  if (status >= 400) return 'client-error';
  if (status >= 300) return 'redirect';
  return 'success';
}

export function isFailedRequest(request: NetworkRequest): boolean {
  const state = requestState(request);
  return state === 'failed' || state === 'client-error' || state === 'server-error';
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '…';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatBytes(length: number): string {
  if (length < 1024) return `${length} B`;
  if (length < 1024 * 1024) return `${(length / 1024).toFixed(1)} KB`;
  return `${(length / (1024 * 1024)).toFixed(1)} MB`;
}

/** Host and path+query of a URL; tolerates relative and malformed URLs. */
export function splitUrl(url: string): { host: string; path: string } {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^#]*)/i.exec(url);
  if (!match) return { host: '', path: url };
  return { host: match[1], path: match[2] || '/' };
}

/** One console argument as text: strings as-is, errors as `Name: message`, everything else as compact JSON. */
export function formatConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg === null || typeof arg !== 'object') return String(arg);
  // The SDK sends Errors as { name, message, stack }.
  const maybeError = arg as { name?: unknown; message?: unknown; stack?: unknown };
  if (typeof maybeError.message === 'string' && typeof maybeError.stack === 'string') {
    return `${typeof maybeError.name === 'string' ? maybeError.name : 'Error'}: ${maybeError.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function formatConsoleArgs(args: readonly unknown[], maxLength = 2000): string {
  const text = args.map(formatConsoleArg).join(' ');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function tryParseJson(text: string | undefined): { ok: true; value: unknown } | { ok: false } {
  if (!text) return { ok: false };
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The request as a cURL command, to replay it from a terminal. */
export function toCurl(request: NetworkRequest): string {
  const parts = ['curl'];
  if (request.method !== 'GET') parts.push('-X', request.method);
  parts.push(shellQuote(request.url));
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    parts.push('-H', shellQuote(`${name}: ${value}`));
  }
  if (request.body !== undefined) parts.push('--data-raw', shellQuote(request.body));
  return parts.join(' ');
}

/** Case-insensitive substring match; an empty query matches everything. */
export function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}
