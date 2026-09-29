import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import type {
  ConsoleMessage,
  CustomEvent,
  NetworkRequest,
  PerformanceMark,
  SdkMessage,
  StateSnapshot,
  ZustandStoreSnapshot,
} from '@android-debugger/shared';

// No React or React Native imports: this is unit tested in Node.

export interface ConsoleEntry {
  id: number;
  level: ConsoleMessage['level'];
  args: unknown[];
  timestamp: number;
}

export interface TimelineEvent {
  id: number;
  kind: 'custom' | 'performance';
  name: string;
  timestamp: number;
  data?: unknown;
  /** Performance marks only. */
  duration?: number;
}

export interface StateEntry {
  /** `state:<name>` or `zustand:<name>` */
  key: string;
  name: string;
  source: 'state' | 'zustand';
  state: unknown;
  timestamp: number;
  updates: number;
}

/** Everything captured in the app, oldest first. Replaced (never mutated) on change. */
export interface DebuggerData {
  network: NetworkRequest[];
  console: ConsoleEntry[];
  events: TimelineEvent[];
  /** Most recently updated last. */
  states: StateEntry[];
}

export type DebuggerDataKind = keyof DebuggerData;

export const DEBUGGER_DATA_LIMITS: Readonly<Record<DebuggerDataKind, number>> = {
  network: 300,
  console: 500,
  events: 300,
  states: 100,
};

const FLUSH_DELAY_MS = 100;

/**
 * Keeps bounded copies of what the SDK captures, for the in-app debugger.
 * Messages are applied in batches so a burst of logs causes one re-render.
 */
export class DebuggerStore {
  private data: DebuggerData = { network: [], console: [], events: [], states: [] };
  private network = new Map<string, NetworkRequest>();
  private states = new Map<string, StateEntry>();
  private pending: SdkMessage[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private stopRecording: (() => void) | null = null;
  private nextId = 0;

  /** Starts recording SDK messages. Idempotent. */
  start(): void {
    if (!this.stopRecording) this.stopRecording = AndroidDebugger.onMessage((message) => this.add(message));
  }

  stop(): void {
    this.stopRecording?.();
    this.stopRecording = null;
  }

  getSnapshot = (): DebuggerData => this.data;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  add(message: SdkMessage): void {
    this.pending.push(message);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
  }

  /** Applies pending messages now instead of on the next tick. */
  flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.pending.length === 0) return;
    const messages = this.pending;
    this.pending = [];

    const consoleEntries: ConsoleEntry[] = [];
    const events: TimelineEvent[] = [];
    let networkChanged = false;
    let statesChanged = false;

    for (const message of messages) {
      const payload = message.payload as Record<string, unknown> | null;
      if (!payload || typeof payload !== 'object') continue;
      switch (message.type) {
        case 'network': {
          const request = payload as unknown as NetworkRequest;
          if (typeof request.id !== 'string') break;
          // Start and completion share an id; the completion replaces the start in place.
          this.network.set(request.id, request);
          networkChanged = true;
          break;
        }
        case 'console': {
          const entry = payload as unknown as ConsoleMessage;
          consoleEntries.push({
            id: ++this.nextId,
            level: entry.level,
            args: Array.isArray(entry.args) ? entry.args : [],
            timestamp: entry.timestamp ?? message.timestamp,
          });
          break;
        }
        case 'custom': {
          const event = payload as unknown as CustomEvent;
          events.push({ id: ++this.nextId, kind: 'custom', name: String(event.name), timestamp: event.timestamp ?? message.timestamp, data: event.data });
          break;
        }
        case 'performance': {
          const mark = payload as unknown as PerformanceMark;
          events.push({ id: ++this.nextId, kind: 'performance', name: String(mark.name), timestamp: message.timestamp, duration: mark.duration });
          break;
        }
        case 'state':
        case 'zustand': {
          const snapshot = payload as unknown as StateSnapshot | ZustandStoreSnapshot;
          if (typeof snapshot.name !== 'string') break;
          const key = `${message.type}:${snapshot.name}`;
          const previous = this.states.get(key);
          // Re-inserting moves the store to the end: most recently updated last.
          this.states.delete(key);
          this.states.set(key, {
            key,
            name: snapshot.name,
            source: message.type,
            state: snapshot.state,
            timestamp: snapshot.timestamp ?? message.timestamp,
            updates: (previous?.updates ?? 0) + 1,
          });
          statesChanged = true;
          break;
        }
      }
    }

    const next: DebuggerData = { ...this.data };
    if (networkChanged) {
      trimMap(this.network, DEBUGGER_DATA_LIMITS.network);
      next.network = [...this.network.values()];
    }
    if (statesChanged) {
      trimMap(this.states, DEBUGGER_DATA_LIMITS.states);
      next.states = [...this.states.values()];
    }
    if (consoleEntries.length > 0) next.console = appendBounded(this.data.console, consoleEntries, DEBUGGER_DATA_LIMITS.console);
    if (events.length > 0) next.events = appendBounded(this.data.events, events, DEBUGGER_DATA_LIMITS.events);

    if (networkChanged || statesChanged || consoleEntries.length > 0 || events.length > 0) {
      this.data = next;
      this.notify();
    }
  }

  /** Forgets captured data of one kind, or everything. */
  clear(kind?: DebuggerDataKind): void {
    this.flush();
    const next: DebuggerData = { ...this.data };
    if (!kind || kind === 'network') {
      this.network.clear();
      next.network = [];
    }
    if (!kind || kind === 'states') {
      this.states.clear();
      next.states = [];
    }
    if (!kind || kind === 'console') next.console = [];
    if (!kind || kind === 'events') next.events = [];
    this.data = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function trimMap<V>(map: Map<string, V>, limit: number): void {
  for (const key of map.keys()) {
    if (map.size <= limit) break;
    map.delete(key);
  }
}

function appendBounded<T>(existing: readonly T[], added: readonly T[], limit: number): T[] {
  const combined = existing.concat(added);
  return combined.length > limit ? combined.slice(combined.length - limit) : combined;
}

/**
 * The store behind the in-app debugger and the data hooks. It starts recording
 * as soon as this package is imported, so import it early (e.g. in your root
 * layout) to capture startup activity.
 */
export const debuggerStore = new DebuggerStore();
debuggerStore.start();

/** Forgets what the in-app debugger captured (one kind, or everything). */
export function clearDebuggerData(kind?: DebuggerDataKind): void {
  debuggerStore.clear(kind);
}
