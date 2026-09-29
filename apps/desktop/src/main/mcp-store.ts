/**
 * Bounded, main-process copies of the data the renderer streams (logs,
 * crashes, SDK messages, monitor samples), so MCP tools can answer even when
 * the window is hidden or showing another tab. Filled by tapping the same
 * streams index.ts / monitor-hub.ts already forward to the renderer.
 *
 * Pure (type-only imports plus node:vm) so it can be unit tested with node:test.
 */
import * as vm from 'node:vm';
import type {
  ConsoleMessage,
  CrashEntry,
  CustomEvent,
  LogLevel,
  NetworkRequest,
  SdkMessage,
  StateSnapshot,
  WebSocketConnection,
  WebSocketEvent,
  WebSocketMessage,
  ZustandStoreSnapshot,
} from '@android-debugger/shared';
import type { LogBatch, LogLine, LogStreamMode, LogStreamRequest, LogStreamState, LogStreamStatus } from './logcat-format';
import type { MonitorKind } from '../preload/monitor-types';

export const MCP_LOG_CAPACITY = 5000;
export const MCP_CRASH_CAPACITY = 200;
export const MCP_CONSOLE_CAPACITY = 1000;
export const MCP_NETWORK_CAPACITY = 500;
export const MCP_WS_CONNECTION_CAPACITY = 100;
export const MCP_WS_MESSAGE_CAPACITY = 1000;
export const MCP_WS_EVENT_CAPACITY = 500;
export const MCP_STATE_CAPACITY = 200;
export const MCP_CUSTOM_EVENT_CAPACITY = 200;
export const MCP_MONITOR_CAPACITY = 300;

export class RingBuffer<T> {
  private items: T[] = [];
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
  }

  pushMany(items: readonly T[]): void {
    for (const item of items) this.items.push(item);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
  }

  toArray(): T[] {
    return this.items.slice();
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}

/** Map that forgets its oldest keys past `capacity`; updating a key keeps its position. */
class BoundedMap<K, V> {
  private map = new Map<K, V>();
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  set(key: K, value: V): void {
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  values(): V[] {
    return [...this.map.values()];
  }

  clear(): void {
    this.map.clear();
  }
}

export interface LogTarget {
  deviceId: string;
  mode: LogStreamMode;
  packageName: string;
}

export interface SdkTarget {
  deviceId: string;
  packageName: string;
}

export interface ConsoleLine {
  level: ConsoleMessage['level'];
  message: string;
  timestamp: number;
}

export interface StoredCrash {
  deviceId: string;
  receivedAt: number;
  entry: CrashEntry;
}

export interface StoredState {
  name: string;
  source: 'state' | 'zustand';
  state: unknown;
  timestamp: number;
}

export interface MonitorSample {
  receivedAt: number;
  payload: unknown;
}

export type LiveLogState = LogStreamState | 'idle';

export function formatConsoleArgs(args: unknown): string {
  if (!Array.isArray(args)) return String(args ?? '');
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}

export class McpDataStore {
  // ---- Visible log stream (Logs panel) ----
  private logTarget: LogTarget | null = null;
  private logSessionId = 0;
  private logState: LiveLogState = 'idle';
  private logMessage: string | undefined;
  readonly logs = new RingBuffer<LogLine>(MCP_LOG_CAPACITY);

  beginLogStream(request: LogStreamRequest): void {
    const target: LogTarget = {
      deviceId: request.deviceId,
      mode: request.mode,
      packageName: request.mode === 'app' ? request.packageName ?? '' : '',
    };
    const same =
      this.logTarget &&
      this.logTarget.deviceId === target.deviceId &&
      this.logTarget.mode === target.mode &&
      this.logTarget.packageName === target.packageName;
    if (!same) this.logs.clear();
    this.logTarget = target;
    this.logSessionId = request.sessionId;
    this.logState = 'starting';
    this.logMessage = undefined;
  }

  receiveLogBatch(batch: LogBatch): void {
    if (batch.sessionId !== this.logSessionId) return;
    this.logs.pushMany(batch.entries);
  }

  receiveLogStatus(status: LogStreamStatus): void {
    if (status.sessionId !== this.logSessionId) return;
    this.logState = status.state;
    this.logMessage = status.message;
  }

  stopLogStream(): void {
    this.logState = 'idle';
  }

  getLiveLogs(): { target: LogTarget | null; state: LiveLogState; message?: string; lines: LogLine[] } {
    return { target: this.logTarget, state: this.logState, message: this.logMessage, lines: this.logs.toArray() };
  }

  clearLogs(): void {
    this.logs.clear();
  }

  // ---- Crash stream ----
  private crashDeviceId: string | null = null;
  readonly crashes = new RingBuffer<StoredCrash>(MCP_CRASH_CAPACITY);

  setCrashStream(deviceId: string | null): void {
    this.crashDeviceId = deviceId;
  }

  getCrashStreamDevice(): string | null {
    return this.crashDeviceId;
  }

  addCrash(deviceId: string, entry: CrashEntry, now = Date.now()): void {
    this.crashes.push({ deviceId, receivedAt: now, entry });
  }

  // ---- SDK stream (console, network, websocket, state) ----
  private sdkTarget: SdkTarget | null = null;
  private sdkActive = false;
  readonly console = new RingBuffer<ConsoleLine>(MCP_CONSOLE_CAPACITY);
  readonly network = new BoundedMap<string, NetworkRequest>(MCP_NETWORK_CAPACITY);
  readonly wsConnections = new BoundedMap<string, WebSocketConnection>(MCP_WS_CONNECTION_CAPACITY);
  readonly wsMessages = new RingBuffer<WebSocketMessage>(MCP_WS_MESSAGE_CAPACITY);
  readonly wsEvents = new RingBuffer<WebSocketEvent>(MCP_WS_EVENT_CAPACITY);
  readonly states = new BoundedMap<string, StoredState>(MCP_STATE_CAPACITY);
  readonly customEvents = new RingBuffer<CustomEvent>(MCP_CUSTOM_EVENT_CAPACITY);

  /** Called when the renderer (re)starts the SDK stream; a new target starts from empty. */
  setSdkTarget(deviceId: string, packageName: string): void {
    const same = this.sdkTarget?.deviceId === deviceId && this.sdkTarget.packageName === packageName;
    if (!same) this.clearSdk();
    this.sdkTarget = { deviceId, packageName };
    this.sdkActive = true;
  }

  stopSdkStream(): void {
    this.sdkActive = false;
  }

  getSdkStatus(): { target: SdkTarget | null; active: boolean } {
    return { target: this.sdkTarget, active: this.sdkActive };
  }

  clearSdk(): void {
    this.console.clear();
    this.network.clear();
    this.wsConnections.clear();
    this.wsMessages.clear();
    this.wsEvents.clear();
    this.states.clear();
    this.customEvents.clear();
  }

  addSdkMessages(messages: readonly SdkMessage[]): void {
    for (const message of messages) this.addSdkMessage(message);
  }

  private addSdkMessage(message: SdkMessage): void {
    const payload = message.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== 'object') return;
    switch (message.type) {
      case 'console': {
        const consoleMessage = payload as unknown as ConsoleMessage;
        this.console.push({
          level: consoleMessage.level,
          message: formatConsoleArgs(consoleMessage.args),
          timestamp: consoleMessage.timestamp ?? message.timestamp,
        });
        return;
      }
      case 'network': {
        const request = payload as unknown as NetworkRequest;
        if (typeof request.id === 'string') this.network.set(request.id, request);
        return;
      }
      case 'state': {
        const state = payload as unknown as StateSnapshot;
        if (typeof state.name === 'string') {
          this.states.set(`state:${state.name}`, { name: state.name, source: 'state', state: state.state, timestamp: state.timestamp });
        }
        return;
      }
      case 'zustand': {
        const snapshot = payload as unknown as ZustandStoreSnapshot;
        if (typeof snapshot.name === 'string') {
          this.states.set(`zustand:${snapshot.name}`, {
            name: snapshot.name,
            source: 'zustand',
            state: snapshot.state,
            timestamp: snapshot.timestamp,
          });
        }
        return;
      }
      case 'custom':
        this.customEvents.push(payload as unknown as CustomEvent);
        return;
      case 'websocket': {
        const ws = payload as {
          type?: string;
          connection?: WebSocketConnection;
          message?: WebSocketMessage;
          event?: WebSocketEvent;
        };
        if (ws.connection?.id) {
          const existing = this.wsConnections.get(ws.connection.id);
          this.wsConnections.set(ws.connection.id, { ...existing, ...ws.connection });
        }
        if (ws.type === 'message' && ws.message) this.wsMessages.push(ws.message);
        if (ws.type === 'event' && ws.event) this.wsEvents.push(ws.event);
        return;
      }
    }
  }

  // ---- Monitor samples ----
  private monitorSamples = new Map<MonitorKind, { key: string; samples: RingBuffer<MonitorSample> }>();

  addMonitorSample(kind: MonitorKind, deviceId: string, packageName: string, payload: unknown, now = Date.now()): void {
    const key = `${deviceId}\u0000${packageName}`;
    let entry = this.monitorSamples.get(kind);
    if (!entry || entry.key !== key) {
      entry = { key, samples: new RingBuffer<MonitorSample>(MCP_MONITOR_CAPACITY) };
      this.monitorSamples.set(kind, entry);
    }
    entry.samples.push({ receivedAt: now, payload });
  }

  /** Samples for this target (device-wide kinds ignore packageName); empty when the monitor watched something else. */
  getMonitorSamples(kind: MonitorKind, deviceId: string, packageName: string): MonitorSample[] {
    const entry = this.monitorSamples.get(kind);
    const key = `${deviceId}\u0000${kind === 'battery' ? '' : packageName}`;
    return entry && entry.key === key ? entry.samples.toArray() : [];
  }
}

// ---------------- Queries ----------------

export const LOG_LEVELS: readonly LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];
const LEVEL_RANK: Record<LogLevel, number> = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5, S: 6 };

/**
 * Parses "30s", "5m", "2h", "1d" (relative to `now`), an ISO date or epoch
 * milliseconds. Returns epoch ms, or null when absent. Throws on garbage.
 */
export function parseSince(value: string | number | undefined, now = Date.now()): number | null {
  if (value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('`since` must be a finite number');
    return value;
  }
  const trimmed = value.trim();
  const relative = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i.exec(trimmed);
  if (relative) {
    const unit: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return now - Number(relative[1]) * unit[relative[2].toLowerCase()];
  }
  if (/^\d{12,}$/.test(trimmed)) return Number(trimmed);
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error('`since` must look like "5m", "30s", "2h", an ISO time such as "2026-09-29T10:15:00Z", or epoch milliseconds');
  }
  return parsed;
}

export interface LogQuery {
  minLevel?: LogLevel;
  /** Only these tags (case-insensitive exact match). */
  tags?: string[];
  excludeTags?: string[];
  search?: string;
  regex?: boolean;
  sinceEpochMs?: number | null;
  limit: number;
}

export interface LogQueryResult {
  lines: LogLine[];
  /** Lines that matched before `limit` kept the newest ones. */
  matched: number;
}

/** Wall-clock budget for one regex search over the log lines. */
export const REGEX_SEARCH_TIMEOUT_MS = 1000;

const REGEX_SEARCH_SCRIPT = new vm.Script(`(() => {
  const re = new RegExp(pattern, 'i');
  const hits = [];
  for (let i = 0; i < messages.length; i++) {
    if (re.test(messages[i]) || re.test(tags[i])) hits.push(i);
  }
  return hits;
})()`);

/**
 * Runs a client-supplied regex in a vm context with a timeout, so a
 * catastrophically backtracking pattern (e.g. "(a+)+$") errors out instead of
 * freezing the main process.
 */
function regexSearch(pattern: string, candidates: readonly LogLine[], timeoutMs: number): Set<number> {
  const messages = candidates.map((line) => line.message);
  const tags = candidates.map((line) => line.tag);
  try {
    const hits = REGEX_SEARCH_SCRIPT.runInNewContext({ pattern, messages, tags }, { timeout: timeoutMs }) as number[];
    return new Set(Array.from(hits));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      throw new Error('The regular expression took too long to run. Simplify it (avoid nested quantifiers such as "(a+)+").');
    }
    throw error;
  }
}

export function queryLogLines(
  lines: readonly LogLine[],
  query: LogQuery,
  options: { regexTimeoutMs?: number } = {}
): LogQueryResult {
  const minRank = LEVEL_RANK[query.minLevel ?? 'V'] ?? 0;
  const include = query.tags?.length ? new Set(query.tags.map((tag) => tag.toLowerCase())) : null;
  const exclude = query.excludeTags?.length ? new Set(query.excludeTags.map((tag) => tag.toLowerCase())) : null;
  const search = query.search?.trim();
  let needle: string | null = null;
  if (search) {
    if (query.regex) {
      try {
        new RegExp(search, 'i'); // syntax check only; matching runs under a timeout
      } catch (error) {
        const reason = error instanceof Error ? error.message.replace(/^Invalid regular expression:\s*/, '') : String(error);
        throw new Error(`Invalid regular expression: ${reason}`);
      }
    } else {
      needle = search.toLowerCase();
    }
  }
  const since = query.sinceEpochMs ?? null;

  let matched: LogLine[] = [];
  for (const line of lines) {
    if ((LEVEL_RANK[line.level] ?? 0) < minRank) continue;
    const tag = line.tag.toLowerCase();
    if (include && !include.has(tag)) continue;
    if (exclude && exclude.has(tag)) continue;
    // Lines without a device timestamp can't be placed in time; keep them.
    if (since !== null && line.epochMs > 0 && line.epochMs < since) continue;
    if (needle !== null && !line.message.toLowerCase().includes(needle) && !tag.includes(needle)) continue;
    matched.push(line);
  }
  if (search && query.regex && matched.length > 0) {
    const hits = regexSearch(search, matched, options.regexTimeoutMs ?? REGEX_SEARCH_TIMEOUT_MS);
    matched = matched.filter((_, index) => hits.has(index));
  }
  const limit = Math.max(1, Math.floor(query.limit));
  return { lines: matched.slice(-limit), matched: matched.length };
}

export function formatLogLineForMcp(line: LogLine): string {
  const pid = line.pid !== undefined ? `(${line.pid})` : '';
  return `${line.timestamp} ${line.level} ${line.tag}${pid}: ${line.message}`;
}

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated ${text.length - max} characters]`;
}

export interface SeriesSummary {
  latest: number;
  min: number;
  max: number;
  avg: number;
  samples: number;
}

export function summarizeSeries(values: readonly number[]): SeriesSummary | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const sum = finite.reduce((total, value) => total + value, 0);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    latest: round(finite[finite.length - 1]),
    min: round(Math.min(...finite)),
    max: round(Math.max(...finite)),
    avg: round(sum / finite.length),
    samples: finite.length,
  };
}

export interface NetworkQuery {
  urlContains?: string;
  method?: string;
  /** 'failed' = error or status >= 400; 'ok' = 2xx/3xx; a number = that exact status. */
  status?: 'failed' | 'ok' | 'pending' | number;
  sinceEpochMs?: number | null;
  limit: number;
  includeBodies?: boolean;
  maxBodyChars?: number;
}

export function queryNetworkRequests(requests: readonly NetworkRequest[], query: NetworkQuery) {
  const needle = query.urlContains?.toLowerCase();
  const method = query.method?.toUpperCase();
  const since = query.sinceEpochMs ?? null;
  const matched = requests.filter((request) => {
    if (needle && !request.url.toLowerCase().includes(needle)) return false;
    if (method && request.method.toUpperCase() !== method) return false;
    if (since !== null && request.timestamp < since) return false;
    const status = query.status;
    if (status === 'failed' && !(request.error || (request.status ?? 0) >= 400)) return false;
    if (status === 'ok' && !(request.status && request.status < 400 && !request.error)) return false;
    if (status === 'pending' && (request.status !== undefined || request.error)) return false;
    if (typeof status === 'number' && request.status !== status) return false;
    return true;
  });
  const limit = Math.max(1, Math.floor(query.limit));
  const maxBody = query.maxBodyChars ?? 2000;
  const items = matched.slice(-limit).map((request) => {
    const base = {
      id: request.id,
      method: request.method,
      url: request.url,
      status: request.status ?? null,
      durationMs: request.duration ?? null,
      error: request.error,
      startedAt: new Date(request.timestamp).toISOString(),
    };
    if (!query.includeBodies) return base;
    return {
      ...base,
      requestHeaders: request.headers,
      requestBody: request.body !== undefined ? truncateText(String(request.body), maxBody) : undefined,
      responseHeaders: request.responseHeaders,
      responseBody: request.responseBody !== undefined ? truncateText(String(request.responseBody), maxBody) : undefined,
    };
  });
  return { matched: matched.length, requests: items };
}
