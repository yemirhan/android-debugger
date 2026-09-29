/**
 * App-level log store. Lives outside React so the buffer survives tab
 * switches and incoming batches never re-render anything but the Logs view.
 * Read it with useSyncExternalStore (see hooks/useLogs.ts).
 *
 * No runtime imports: unit-tested from src/main/log-store.test.ts.
 */
import type { LogBatch, LogLine, LogStreamMode, LogStreamStatus } from '../../main/logcat-format';
import type { LogFilter, LogRow } from './log-filter';

export type LogStatus =
  | 'no-device'
  | 'needs-app'
  | 'stopped'
  | 'starting'
  | 'streaming'
  | 'waiting-for-app'
  | 'ended'
  | 'error';

export type HistoryState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

export interface LogStoreState {
  /** Oldest first. Replaced (never mutated) on every change. */
  rows: readonly LogRow[];
  /** Bumps whenever rows change other than by appending (clear, history, trim). */
  generation: number;
  capacity: number;
  /** Lines received since the target last changed (including evicted ones). */
  received: number;
  /** Lines main dropped because the renderer fell behind. */
  dropped: number;
  /** Lines evicted from the front of the buffer since the target last changed. */
  evicted: number;

  mode: LogStreamMode;
  /** User intent: stream while a device is connected. */
  enabled: boolean;
  status: LogStatus;
  statusMessage?: string;
  /** Device time the buffer's coverage starts at; history loads lines before it. */
  coverageStartEpochMs?: number;
  history: HistoryState;
  historyMessage?: string;

  /** Pause freezes the view; rows keep arriving underneath. */
  paused: boolean;
  frozenRows: readonly LogRow[] | null;
  frozenGeneration: number;

  filter: LogFilter;
  /** Bumped to force the stream effect to restart. */
  restartToken: number;
}

export interface LogTarget {
  deviceId: string;
  mode: LogStreamMode;
  packageName: string;
}

export interface LogStoreOptions {
  capacity: number;
  defaultFilter: LogFilter;
  mode?: LogStreamMode;
  enabled?: boolean;
  onModeChange?: (mode: LogStreamMode) => void;
}

export function createLogStore(options: LogStoreOptions) {
  let state: LogStoreState = {
    rows: [],
    generation: 0,
    capacity: Math.max(1, options.capacity),
    received: 0,
    dropped: 0,
    evicted: 0,
    mode: options.mode ?? 'rn',
    enabled: options.enabled ?? true,
    status: 'no-device',
    history: 'idle',
    paused: false,
    frozenRows: null,
    frozenGeneration: 0,
    filter: options.defaultFilter,
    restartToken: 0,
  };
  const listeners = new Set<() => void>();
  let seq = 0;
  let sessionId = 0;
  let activeSession = 0;
  let target: LogTarget | null = null;
  let resumeRequested = false;
  let consecutiveEnds = 0;

  const set = (patch: Partial<LogStoreState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const trim = (rows: LogRow[], capacity: number) => (rows.length > capacity ? rows.slice(rows.length - capacity) : rows);

  const resetRows = (): Partial<LogStoreState> => ({
    rows: [],
    generation: state.generation + 1,
    received: 0,
    dropped: 0,
    evicted: 0,
    coverageStartEpochMs: undefined,
    history: 'idle',
    historyMessage: undefined,
    frozenRows: state.paused ? [] : null,
    frozenGeneration: state.generation + 1,
  });

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState(): LogStoreState {
      return state;
    },

    /**
     * Called by the stream owner when a device/mode/app is selected. Clears the
     * buffer only when the target actually changed, so a brief disconnect or a
     * restart keeps what was already captured.
     */
    beginSession(next: LogTarget): { sessionId: number; resumeAfterEpochMs?: number } {
      const sameTarget =
        !!target && target.deviceId === next.deviceId && target.mode === next.mode && target.packageName === next.packageName;
      const patch: Partial<LogStoreState> = sameTarget ? {} : resetRows();
      let resumeAfterEpochMs: number | undefined;
      if (sameTarget && resumeRequested) {
        const last = state.rows[state.rows.length - 1];
        if (last?.epochMs) resumeAfterEpochMs = last.epochMs;
      }
      resumeRequested = false;
      target = next;
      activeSession = ++sessionId;
      set({ ...patch, status: 'starting', statusMessage: undefined });
      return { sessionId: activeSession, resumeAfterEpochMs };
    },

    /** Stream torn down (device gone, mode switch, stop). */
    endSession(nextStatus: LogStatus, message?: string, options: { resumeOnReturn?: boolean } = {}): void {
      activeSession = 0;
      // Coming back to the same target after a disconnect continues where we left off.
      resumeRequested = !!options.resumeOnReturn;
      if (state.status !== nextStatus || state.statusMessage !== message) set({ status: nextStatus, statusMessage: message });
    },

    /** Marks a target the stream cannot run for (e.g. App mode, no app chosen). */
    setIdleTarget(next: LogTarget | null, status: LogStatus, message?: string): void {
      const changed =
        !next ||
        !target ||
        target.deviceId !== next.deviceId ||
        target.mode !== next.mode ||
        target.packageName !== next.packageName;
      const patch: Partial<LogStoreState> = next && changed ? resetRows() : {};
      if (next) target = next;
      activeSession = 0;
      set({ ...patch, status, statusMessage: message });
    },

    receiveBatch(batch: LogBatch): void {
      if (batch.sessionId !== activeSession) return;
      consecutiveEnds = 0;
      const incoming = batch.entries as LogRow[];
      for (const row of incoming) row.seq = ++seq;
      const combined = state.rows.length === 0 ? incoming : state.rows.concat(incoming);
      const rows = trim(combined, state.capacity);
      set({
        rows,
        received: state.received + incoming.length,
        dropped: state.dropped + batch.dropped,
        evicted: state.evicted + (combined.length - rows.length),
      });
    },

    receiveStatus(status: LogStreamStatus): void {
      if (status.sessionId !== activeSession) return;
      const patch: Partial<LogStoreState> = { status: status.state, statusMessage: status.message };
      if (status.state === 'streaming' && state.coverageStartEpochMs === undefined && status.sinceEpochMs) {
        patch.coverageStartEpochMs = status.sinceEpochMs;
      }
      if (status.state === 'ended') {
        consecutiveEnds++;
        activeSession = 0;
      }
      set(patch);
    },

    /** How many times in a row the stream ended without delivering lines. */
    getConsecutiveEnds(): number {
      return consecutiveEnds;
    },

    /** Restart the stream; `resume` continues after the last received line. */
    restart(resume: boolean): void {
      resumeRequested = resume;
      set({ restartToken: state.restartToken + 1 });
    },

    setEnabled(enabled: boolean): void {
      if (enabled !== state.enabled) {
        consecutiveEnds = 0;
        set({ enabled });
      }
    },

    setMode(mode: LogStreamMode): void {
      if (mode !== state.mode) {
        options.onModeChange?.(mode);
        set({ mode });
      }
    },

    setCapacity(capacity: number): void {
      const next = Math.max(1, Math.floor(capacity));
      if (next === state.capacity) return;
      const rows = trim(state.rows as LogRow[], next);
      set({
        capacity: next,
        rows,
        evicted: state.evicted + (state.rows.length - rows.length),
        generation: rows === state.rows ? state.generation : state.generation + 1,
      });
    },

    clear(): void {
      const generation = state.generation + 1;
      set({
        rows: [],
        generation,
        received: 0,
        dropped: 0,
        evicted: 0,
        frozenRows: state.paused ? [] : null,
        frozenGeneration: generation,
        // Lines before now are "history" again, but clearing means the user
        // wants a clean slate, so don't offer to reload what they cleared.
        history: 'idle',
        historyMessage: undefined,
      });
    },

    setHistoryLoading(): void {
      set({ history: 'loading', historyMessage: undefined });
    },

    /** Prepends lines that were logged before the buffer's coverage started. */
    prependHistory(entries: LogLine[], error?: string): void {
      if (error) {
        set({ history: 'error', historyMessage: error });
        return;
      }
      if (entries.length === 0) {
        set({ history: 'empty', historyMessage: 'No earlier lines are left in the device log buffer.' });
        return;
      }
      // History rows get sequence numbers below everything already held.
      const first = state.rows[0]?.seq ?? seq + 1;
      const older = entries as LogRow[];
      for (let i = 0; i < older.length; i++) older[i].seq = first - older.length + i;
      const combined = older.concat(state.rows);
      const rows = trim(combined, state.capacity);
      const oldestEpoch = older.find((row) => row.epochMs > 0)?.epochMs;
      set({
        rows,
        generation: state.generation + 1,
        received: state.received + older.length,
        history: 'loaded',
        historyMessage: `Loaded ${older.length.toLocaleString()} earlier line${older.length === 1 ? '' : 's'}.`,
        coverageStartEpochMs: oldestEpoch ?? state.coverageStartEpochMs,
      });
    },

    setPaused(paused: boolean): void {
      if (paused === state.paused) return;
      set(
        paused
          ? { paused, frozenRows: state.rows, frozenGeneration: state.generation }
          : { paused, frozenRows: null }
      );
    },

    setFilter(patch: Partial<LogFilter>): void {
      set({ filter: { ...state.filter, ...patch } });
    },

    resetFilter(): void {
      set({ filter: options.defaultFilter });
    },

    getTarget(): LogTarget | null {
      return target;
    },
  };
}

export type LogStore = ReturnType<typeof createLogStore>;
