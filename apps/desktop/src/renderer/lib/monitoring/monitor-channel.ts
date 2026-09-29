/**
 * Framework-free state machine for one background monitor (memory, CPU, ...).
 *
 * A channel owns the single adb poller of its kind for the selected target,
 * keeps a bounded history, and is read by any number of views through
 * subscribe/getState (useSyncExternalStore). It has no runtime imports so it
 * can be unit tested with node:test.
 */

export type MonitorScope = 'device' | 'app';

export interface MonitorTarget {
  deviceId: string;
  packageName: string;
}

/** Starts/stops the actual poller (IPC to the main process in the app). */
export interface MonitorDriver {
  start(target: MonitorTarget, session: number, intervalMs: number): void;
  stop(): void;
}

export interface MonitorState<P, E> {
  /** Identity of the target the data belongs to; '' when there's nothing to monitor. */
  targetKey: string;
  /** The user wants this monitor on (auto-start or an explicit start). */
  enabled: boolean;
  /** A poller is running right now (enabled and a target is available). */
  running: boolean;
  entries: readonly E[];
  current: P | null;
  intervalMs: number;
}

export interface MonitorChannelOptions<P, E> {
  scope: MonitorScope;
  maxEntries: number;
  toEntry: (payload: P, receivedAt: number) => E;
  driver: MonitorDriver;
  intervalMs: number;
  /** Session numbers must be unique across channels and restarts. */
  nextSession: () => number;
  now?: () => number;
}

export function appendBounded<T>(entries: readonly T[], entry: T, max: number): T[] {
  if (max <= 0) return [];
  const start = entries.length + 1 > max ? entries.length + 1 - max : 0;
  const next = entries.slice(start);
  next.push(entry);
  return next;
}

export function scopedTargetKey(scope: MonitorScope, target: MonitorTarget | null): string {
  if (!target || !target.deviceId) return '';
  if (scope === 'device') return target.deviceId;
  return target.packageName ? `${target.deviceId}\u0000${target.packageName}` : '';
}

export class MonitorChannel<P, E = P> {
  private state: MonitorState<P, E>;
  private target: MonitorTarget | null = null;
  /** Session of the running poller; 0 when nothing should be accepted. */
  private session = 0;
  private readonly listeners = new Set<() => void>();
  private readonly options: MonitorChannelOptions<P, E>;

  constructor(options: MonitorChannelOptions<P, E>) {
    this.options = options;
    this.state = {
      targetKey: '',
      enabled: false,
      running: false,
      entries: [],
      current: null,
      intervalMs: options.intervalMs,
    };
  }

  get scope(): MonitorScope {
    return this.options.scope;
  }

  getState = (): MonitorState<P, E> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Point the monitor at a device/app. When the scoped target changes the
   * history is discarded, any in-flight samples are invalidated and the
   * monitor (re)starts if `enableOnChange` is set. Device-wide monitors keep
   * their history when only the app changes.
   */
  setTarget(target: MonitorTarget | null, enableOnChange: boolean): void {
    this.target = target;
    const key = scopedTargetKey(this.options.scope, target);
    if (key === this.state.targetKey) return;
    this.halt();
    this.state = {
      ...this.state,
      targetKey: key,
      enabled: key !== '' && enableOnChange,
      running: false,
      entries: [],
      current: null,
    };
    this.reconcile();
    this.emit();
  }

  setEnabled(enabled: boolean): void {
    if (this.state.enabled === enabled) return;
    this.state = { ...this.state, enabled };
    this.reconcile();
    this.emit();
  }

  /** Apply a new polling interval; a running poller restarts without losing history. */
  setInterval(intervalMs: number): void {
    if (this.state.intervalMs === intervalMs) return;
    this.state = { ...this.state, intervalMs };
    if (this.state.running && this.target) {
      this.session = this.options.nextSession();
      this.options.driver.start(this.target, this.session, intervalMs);
    }
    this.emit();
  }

  /** Drop the history but keep monitoring. */
  clear(): void {
    if (this.state.entries.length === 0 && this.state.current === null) return;
    this.state = { ...this.state, entries: [], current: null };
    this.emit();
  }

  /** Accept a sample from the poller; stale sessions are ignored. */
  receive(session: number, payload: P): boolean {
    if (!this.state.running || session === 0 || session !== this.session) return false;
    const entry = this.options.toEntry(payload, (this.options.now ?? Date.now)());
    this.state = {
      ...this.state,
      entries: appendBounded(this.state.entries, entry, this.options.maxEntries),
      current: payload,
    };
    this.emit();
    return true;
  }

  /**
   * Show a one-off reading (e.g. a manual refresh) as the current value, if
   * it was requested for the target that is still selected.
   */
  setCurrent(targetKey: string, payload: P): boolean {
    if (targetKey === '' || targetKey !== this.state.targetKey) return false;
    this.state = { ...this.state, current: payload };
    this.emit();
    return true;
  }

  /** Stop polling for good (e.g. the app shell unmounted). */
  dispose(): void {
    this.setTarget(null, false);
  }

  private reconcile(): void {
    const shouldRun = this.state.enabled && this.state.targetKey !== '' && this.target !== null;
    if (shouldRun && !this.state.running && this.target) {
      this.session = this.options.nextSession();
      this.state = { ...this.state, running: true };
      this.options.driver.start(this.target, this.session, this.state.intervalMs);
    } else if (!shouldRun && this.state.running) {
      this.halt();
    }
  }

  private halt(): void {
    this.session = 0;
    if (!this.state.running) return;
    this.state = { ...this.state, running: false };
    this.options.driver.stop();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChannel = MonitorChannel<any, any>;

/**
 * Coordinates the channels: one target for all, a global pause, and the
 * auto-start rule. Pausing everything also suppresses auto-start on the next
 * target change until monitoring is resumed (globally or per monitor).
 */
export class MonitorGroup<K extends string> {
  private held = false;
  private target: MonitorTarget | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: MonitorGroupState<K>;
  private readonly channels: Record<K, AnyChannel>;
  private readonly autoStart: () => boolean;

  constructor(channels: Record<K, AnyChannel>, autoStart: () => boolean) {
    this.channels = channels;
    this.autoStart = autoStart;
    for (const channel of Object.values(channels) as AnyChannel[]) {
      channel.subscribe(() => this.refresh());
    }
    this.snapshot = this.compute();
  }

  getState = (): MonitorGroupState<K> => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  channel(kind: K): AnyChannel {
    return this.channels[kind];
  }

  setTarget(target: MonitorTarget | null): void {
    this.target = target;
    const enable = this.autoStart() && !this.held;
    for (const channel of this.all()) channel.setTarget(target, enable);
  }

  start(kind: K): void {
    this.held = false;
    this.channels[kind].setEnabled(true);
    this.refresh();
  }

  stop(kind: K): void {
    this.channels[kind].setEnabled(false);
  }

  pauseAll(): void {
    this.held = true;
    for (const channel of this.all()) channel.setEnabled(false);
    this.refresh();
  }

  resumeAll(): void {
    this.held = false;
    for (const channel of this.all()) {
      if (channel.getState().targetKey !== '') channel.setEnabled(true);
    }
    this.refresh();
  }

  private all(): AnyChannel[] {
    return Object.values(this.channels) as AnyChannel[];
  }

  private compute(): MonitorGroupState<K> {
    const running: K[] = [];
    const available: K[] = [];
    for (const kind of Object.keys(this.channels) as K[]) {
      const state = this.channels[kind].getState();
      if (state.targetKey !== '') available.push(kind);
      if (state.running) running.push(kind);
    }
    return { running, available, paused: this.held, hasTarget: this.target !== null };
  }

  private refresh(): void {
    const next = this.compute();
    const prev = this.snapshot;
    if (
      prev.paused === next.paused &&
      prev.hasTarget === next.hasTarget &&
      sameList(prev.running, next.running) &&
      sameList(prev.available, next.available)
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

export interface MonitorGroupState<K extends string> {
  /** Monitors polling right now. */
  running: readonly K[];
  /** Monitors that have a target (app-scoped ones need an app selected). */
  available: readonly K[];
  /** Everything was paused from the global control. */
  paused: boolean;
  hasTarget: boolean;
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
