import { useEffect, useSyncExternalStore } from 'react';
import type {
  AvdInfo,
  BootProgress,
  EmulatorSetup,
  ImageInstallJob,
  StartAvdOptions,
} from '../../main/emulator-types';
import { toast, updateToast } from './toast';

/**
 * App-wide emulator (AVD) state: the list from main, live boot progress and
 * system image downloads. A module-level store like app-settings/toast, so
 * the Emulators panel, the device picker, the no-device screen and the
 * command panel all share one list and one poll.
 */
export interface EmulatorState {
  setup: EmulatorSetup | null;
  avds: AvdInfo[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  jobs: ImageInstallJob[];
}

let state: EmulatorState = { setup: null, avds: [], loaded: false, loading: false, error: null, jobs: [] };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let queued = false;
let bridged = false;
let pollers = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const api = () => window.electronAPI.emulators;

function set(patch: Partial<EmulatorState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** The reason from an IPC error, without Electron's wrapper. */
export function emulatorError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(?:\w*Error:\s*)+/, '').trim() || 'Something went wrong';
}

function sameList(a: AvdInfo[], b: AvdInfo[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function refreshEmulators(): Promise<void> {
  ensureBridge();
  if (inFlight) {
    // Something changed mid-request: ask again once it settles.
    queued = true;
    return inFlight;
  }
  if (!state.loaded) set({ loading: true });
  inFlight = (async () => {
    try {
      const result = await api().list();
      set({
        setup: result.setup,
        avds: sameList(result.avds, state.avds) ? state.avds : result.avds,
        loaded: true,
        loading: false,
        error: null,
      });
    } catch (error) {
      set({ loaded: true, loading: false, error: emulatorError(error) });
    } finally {
      inFlight = null;
      if (queued) {
        queued = false;
        void refreshEmulators();
      }
    }
  })();
  return inFlight;
}

function upsertJob(job: ImageInstallJob) {
  const jobs = state.jobs.filter((existing) => existing.id !== job.id);
  set({ jobs: [...jobs, job] });
}

function mergeBoot(progress: BootProgress) {
  const avds = state.avds.map((avd) =>
    avd.name === progress.name
      ? {
          ...avd,
          boot: progress,
          serial: progress.serial ?? avd.serial,
          state:
            progress.phase === 'ready'
              ? ('running' as const)
              : progress.phase === 'failed'
                ? avd.state === 'running'
                  ? avd.state
                  : ('stopped' as const)
                : progress.phase === 'booting'
                  ? ('booting' as const)
                  : ('starting' as const),
        }
      : avd
  );
  set({ avds });
}

const bootListeners = new Set<(progress: BootProgress) => void>();

/** Main-process events, subscribed once for the life of the page. */
function ensureBridge() {
  if (bridged) return;
  bridged = true;
  api().onBoot((progress) => {
    mergeBoot(progress);
    bootListeners.forEach((listener) => listener(progress));
    void refreshEmulators();
  });
  api().onChanged(() => void refreshEmulators());
  api().onInstall(upsertJob);
  api()
    .getInstallJobs()
    .then((jobs) => set({ jobs }))
    .catch(() => {});
}

/** Called for every boot progress update (e.g. to select the device once ready). */
export function onEmulatorBoot(listener: (progress: BootProgress) => void): () => void {
  ensureBridge();
  bootListeners.add(listener);
  return () => bootListeners.delete(listener);
}

function isBusy(avd: AvdInfo): boolean {
  return avd.state === 'starting' || avd.state === 'booting' || avd.state === 'stopping';
}

function schedulePoll() {
  if (pollTimer || pollers === 0) return;
  const interval = state.avds.some(isBusy) ? 2_000 : 5_000;
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    if (pollers === 0) return;
    if (document.visibilityState === 'visible') await refreshEmulators();
    schedulePoll();
  }, interval);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): EmulatorState {
  return state;
}

/**
 * Emulator state. `live` keeps the list polling while the caller is mounted
 * (the Emulators panel, an open device picker); otherwise it loads once.
 */
export function useEmulators(options: { live?: boolean } = {}): EmulatorState {
  const live = options.live ?? false;
  useEffect(() => {
    void refreshEmulators();
    if (!live) return;
    pollers += 1;
    schedulePoll();
    return () => {
      pollers -= 1;
      if (pollers === 0 && pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
  }, [live]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getEmulatorState(): EmulatorState {
  return state;
}

// ---------- "open the create dialog" requests (command panel) ----------

let createRequested = false;
const createListeners = new Set<() => void>();

export function requestCreateEmulator(): void {
  createRequested = true;
  createListeners.forEach((listener) => listener());
}

/** Calls `open` whenever "Create emulator" is requested while mounted (or was before mounting). */
export function useCreateEmulatorRequest(open: () => void): void {
  useEffect(() => {
    const consume = () => {
      if (!createRequested) return;
      createRequested = false;
      open();
    };
    consume();
    createListeners.add(consume);
    return () => {
      createListeners.delete(consume);
    };
  }, [open]);
}

// ---------- actions with feedback ----------

export function describeStartOptions(options: StartAvdOptions): string | undefined {
  const parts = [
    options.wipeData ? 'wiping data' : options.coldBoot ? 'cold boot' : null,
    options.headless ? 'no window' : null,
    options.noAudio ? 'no audio' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

export async function startEmulator(avd: Pick<AvdInfo, 'name' | 'displayName'>, options: StartAvdOptions = {}): Promise<boolean> {
  try {
    const progress = await api().start(avd.name, options);
    mergeBoot(progress);
    const how = describeStartOptions(options);
    toast.info(`Starting ${avd.displayName}`, {
      description: how ? `Booting with ${how}. It appears in the device list when it's ready.` : 'It appears in the device list when it’s ready.',
    });
    void refreshEmulators();
    return true;
  } catch (error) {
    toast.error(`Could not start ${avd.displayName}`, { description: emulatorError(error) });
    return false;
  }
}

export async function stopEmulator(avd: Pick<AvdInfo, 'name' | 'displayName'>): Promise<boolean> {
  set({ avds: state.avds.map((item) => (item.name === avd.name ? { ...item, state: 'stopping' as const } : item)) });
  const id = toast.loading(`Stopping ${avd.displayName}…`);
  try {
    await api().stop(avd.name);
    updateToast(id, { kind: 'success', title: `${avd.displayName} stopped` });
    return true;
  } catch (error) {
    updateToast(id, { kind: 'error', title: `Could not stop ${avd.displayName}`, description: emulatorError(error) });
    return false;
  } finally {
    void refreshEmulators();
  }
}

/** Runs a stopped-AVD maintenance action (wipe, delete, rename, …) behind a toast. */
export async function runEmulatorTask(pending: string, done: string, failed: string, task: () => Promise<void>): Promise<boolean> {
  const id = toast.loading(pending);
  try {
    await task();
    updateToast(id, { kind: 'success', title: done });
    return true;
  } catch (error) {
    updateToast(id, { kind: 'error', title: failed, description: emulatorError(error) });
    return false;
  } finally {
    void refreshEmulators();
  }
}

// ---------- display helpers ----------

export function apiLabel(apiLevel: string | null): string | null {
  if (!apiLevel) return null;
  return `API ${apiLevel.replace(/-ext(\d+)$/, ' ext $1')}`;
}

export function versionLabel(androidVersion: string | null, apiLevel: string | null): string {
  const api = apiLabel(apiLevel);
  if (androidVersion && api) return `Android ${androidVersion} · ${api}`;
  return api ?? (androidVersion ? `Android ${androidVersion}` : 'Unknown Android version');
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
