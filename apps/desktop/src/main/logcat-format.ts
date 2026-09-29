/**
 * Pure logcat helpers shared by the visible log stream, the SDK stream and
 * history loading. No Node/Electron imports so it can be unit-tested and
 * type-imported from the renderer.
 */
import type { LogEntry, LogLevel } from '@android-debugger/shared';

/** Which lines the visible log stream shows. */
export type LogStreamMode = 'rn' | 'app' | 'device';

/** A parsed logcat line. `epochMs` is 0 when the line carried no zone/year. */
export interface LogLine extends LogEntry {
  epochMs: number;
}

export interface LogStreamRequest {
  /** Renderer-chosen id; every batch/status echoes it so stale sessions can be ignored. */
  sessionId: number;
  deviceId: string;
  mode: LogStreamMode;
  packageName?: string;
  /** Resume after this device time (epoch ms) instead of "now", e.g. after a dropped stream. */
  resumeAfterEpochMs?: number;
}

export interface LogBatch {
  sessionId: number;
  entries: LogLine[];
  /** Lines dropped in main because the renderer could not keep up. */
  dropped: number;
}

export type LogStreamState =
  | 'starting'
  | 'streaming'
  /** App mode on a pre-Android 9 device, and the app is not running. */
  | 'waiting-for-app'
  /** logcat exited on its own (device unplugged, adb restarted, ...). */
  | 'ended'
  | 'error';

export interface LogStreamStatus {
  sessionId: number;
  state: LogStreamState;
  message?: string;
  /** Device time the stream started from (epoch ms). */
  sinceEpochMs?: number;
}

export interface LogHistoryRequest {
  deviceId: string;
  mode: LogStreamMode;
  packageName?: string;
  /** Only return lines strictly older than this device time (epoch ms). */
  beforeEpochMs?: number;
  limit?: number;
}

export interface LogHistoryResult {
  entries: LogLine[];
  error?: string;
}

/** `threadtime` with a year and UTC offset: unambiguous, sortable timestamps. */
export const LOGCAT_FORMAT_ARGS = ['-v', 'threadtime', '-v', 'year', '-v', 'zone'] as const;

export const RN_LOG_FILTERS = ['*:S', 'ReactNative:V', 'ReactNativeJS:V'] as const;

export interface LogcatSelector {
  mode: LogStreamMode;
  uid?: number;
  pid?: number;
}

/** Filter arguments for a mode. App mode without a uid/pid is a caller error. */
export function selectorArgs({ mode, uid, pid }: LogcatSelector): string[] {
  if (mode === 'rn') return [...RN_LOG_FILTERS];
  if (mode === 'device') return [];
  if (uid) return [`--uid=${uid}`];
  if (pid) return ['--pid', String(pid)];
  throw new Error('App logs need the app uid or pid');
}

/**
 * Args (after `adb -s <serial>`) for a live stream that starts at `since`
 * (device epoch "sssss.mmm") instead of replaying the whole ring buffer.
 * Without a device time we fall back to `-T 1` (one old line at most).
 */
export function buildStreamArgs(selector: LogcatSelector, since: string | null): string[] {
  return ['logcat', ...LOGCAT_FORMAT_ARGS, '-T', since ?? '1', ...selectorArgs(selector)];
}

/** Args for a one-shot dump of what is still in the device's ring buffer. */
export function buildHistoryArgs(selector: LogcatSelector): string[] {
  return ['logcat', '-d', ...LOGCAT_FORMAT_ARGS, ...selectorArgs(selector)];
}

/** Args for the SDK transport stream: only RN tags, scoped to the app when known. */
export function buildSdkStreamArgs(
  target: { uid?: number; pid?: number },
  since: string | null
): string[] {
  const scope = target.uid ? [`--uid=${target.uid}`] : target.pid ? ['--pid', String(target.pid)] : [];
  return ['logcat', ...LOGCAT_FORMAT_ARGS, '-T', since ?? '1', ...scope, ...RN_LOG_FILTERS];
}

/**
 * Parses `date +%s.%N` output into logcat's `-T` epoch form ("sssss.mmm").
 * Returns null when the device's `date` does not support it.
 */
export function parseDeviceEpoch(stdout: string): { since: string; epochMs: number } | null {
  const match = stdout.trim().match(/^(\d{9,})(?:\.(\d+))?$/);
  if (!match) return null;
  const millis = (match[2] ?? '').padEnd(3, '0').slice(0, 3);
  const since = `${match[1]}.${millis}`;
  return { since, epochMs: Number(match[1]) * 1000 + Number(millis) };
}

/** Formats an epoch-ms time as logcat's `-T` argument. */
export function formatLogcatSince(epochMs: number): string {
  const ms = Math.max(0, Math.floor(epochMs));
  return `${Math.floor(ms / 1000)}.${String(ms % 1000).padStart(3, '0')}`;
}

// 2026-09-29 11:20:17.453 +0300  7488 22593 I NearbySharing: message
const THREADTIME_RE =
  /^(?:(\d{4})-)?(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})(?: ([+-])(\d{2})(\d{2}))?\s+(?:(\S+)\s+)??(\d+)\s+(\d+) ([VDIWEFS]) (.*?)\s*:(?: (.*))?$/;
// Legacy `-v time`: 09-29 11:20:17.453 I/Tag( 1234): message
const TIME_RE = /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEFS])\/(.*?)\(\s*(\d+)\):\s?(.*)$/;
const TIME_NO_PID_RE = /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEFS])\/([^:]+):\s?(.*)$/;

/**
 * Parses one logcat line in `threadtime` (optionally with year/zone/uid) or the
 * legacy `time` format. Returns null for separators ("--------- beginning of
 * main") and anything unrecognised.
 */
export function parseLogcatLine(rawLine: string, id: string): LogLine | null {
  const line = rawLine.endsWith('\r') ? rawLine.replace(/\r+$/, '') : rawLine;
  if (!line || line.startsWith('---------')) return null;

  const m = THREADTIME_RE.exec(line);
  if (m) {
    const [, year, month, day, hh, mm, ss, ms, sign, zh, zm, , pid, tid, level, tag, message] = m;
    const timestamp = `${year ? `${year}-` : ''}${month}-${day} ${hh}:${mm}:${ss}.${ms}`;
    let epochMs = 0;
    if (year && sign) {
      const offsetMin = (Number(zh) * 60 + Number(zm)) * (sign === '-' ? -1 : 1);
      epochMs =
        Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm), Number(ss), Number(ms)) -
        offsetMin * 60_000;
    }
    return {
      id,
      timestamp,
      epochMs,
      level: level as LogLevel,
      tag: tag.trim(),
      pid: Number(pid),
      tid: Number(tid),
      message: message ?? '',
    };
  }

  const t = TIME_RE.exec(line);
  if (t) {
    return { id, timestamp: t[1], epochMs: 0, level: t[2] as LogLevel, tag: t[3].trim(), pid: Number(t[4]), message: t[5] };
  }
  const n = TIME_NO_PID_RE.exec(line);
  if (n) {
    return { id, timestamp: n[1], epochMs: 0, level: n[2] as LogLevel, tag: n[3].trim(), message: n[4] };
  }
  return null;
}

/** Splits a UTF-8 text stream into complete lines, holding back a partial tail. */
export class LineSplitter {
  private tail = '';

  push(chunk: string): string[] {
    const text = this.tail + chunk;
    const lines = text.split('\n');
    this.tail = lines.pop() ?? '';
    return lines;
  }

  /** Returns whatever partial line is left (e.g. when the process exits). */
  flush(): string[] {
    const rest = this.tail;
    this.tail = '';
    return rest ? [rest] : [];
  }
}

/**
 * Collects items and hands them out in batches at most every `intervalMs`, so
 * a busy logcat produces ~10 IPC messages a second instead of one per line.
 * If the consumer falls far behind, the oldest pending items are dropped and
 * counted rather than growing memory without bound.
 */
export class Batcher<T> {
  private pending: T[] = [];
  private dropped = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly onFlush: (items: T[], dropped: number) => void;
  private readonly intervalMs: number;
  private readonly maxPending: number;

  constructor(onFlush: (items: T[], dropped: number) => void, intervalMs = 75, maxPending = 20_000) {
    this.onFlush = onFlush;
    this.intervalMs = intervalMs;
    this.maxPending = maxPending;
  }

  push(item: T): void {
    if (this.disposed) return;
    this.pending.push(item);
    if (this.pending.length > this.maxPending) {
      const excess = this.pending.length - this.maxPending;
      this.pending.splice(0, excess);
      this.dropped += excess;
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.intervalMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.disposed || (this.pending.length === 0 && this.dropped === 0)) return;
    const items = this.pending;
    const dropped = this.dropped;
    this.pending = [];
    this.dropped = 0;
    this.onFlush(items, dropped);
  }

  /** Flushes what is pending, then ignores further pushes. */
  dispose(flush = false): void {
    if (flush) this.flush();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
    this.disposed = true;
  }
}

/** Keeps only the last `limit` items pushed. */
export class TailBuffer<T> {
  private items: T[] = [];
  private readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.limit * 2) this.items = this.items.slice(-this.limit);
  }
  toArray(): T[] {
    return this.items.length > this.limit ? this.items.slice(-this.limit) : this.items.slice();
  }
}
