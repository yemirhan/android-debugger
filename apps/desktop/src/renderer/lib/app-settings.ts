import { useSyncExternalStore } from 'react';
import {
  MEMORY_POLL_INTERVAL,
  CPU_POLL_INTERVAL,
  FPS_POLL_INTERVAL,
  MEMORY_WARNING_THRESHOLD,
  MEMORY_CRITICAL_THRESHOLD,
  MAX_LOG_ENTRIES,
} from '@android-debugger/shared';

/**
 * User-configurable app settings, persisted to localStorage.
 *
 * This is a module-level store read through useSyncExternalStore, so no
 * provider needs to be mounted. Non-React code (effects, IPC callbacks) can
 * read the latest values synchronously with getAppSettings().
 */
export interface AppSettings {
  memoryInterval: number;
  cpuInterval: number;
  fpsInterval: number;
  memoryWarningThreshold: number;
  memoryCriticalThreshold: number;
  maxLogEntries: number;
  autoStartLogcat: boolean;
  autoStartMonitoring: boolean;
  /** Switch to an emulator started from the app once it finishes booting. */
  autoSelectBootedEmulator: boolean;
  /** Start emulators with -no-audio. */
  emulatorNoAudio: boolean;
}

type NumericSettingKey = {
  [K in keyof AppSettings]: AppSettings[K] extends number ? K : never;
}[keyof AppSettings];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  memoryInterval: MEMORY_POLL_INTERVAL,
  cpuInterval: CPU_POLL_INTERVAL,
  fpsInterval: FPS_POLL_INTERVAL,
  memoryWarningThreshold: MEMORY_WARNING_THRESHOLD,
  memoryCriticalThreshold: MEMORY_CRITICAL_THRESHOLD,
  maxLogEntries: MAX_LOG_ENTRIES,
  autoStartLogcat: true,
  autoStartMonitoring: true,
  autoSelectBootedEmulator: true,
  emulatorNoAudio: false,
};

// Polling bounds match the clamp applied by the main process.
export const SETTING_LIMITS: Record<NumericSettingKey, { min: number; max: number }> = {
  memoryInterval: { min: 250, max: 60_000 },
  cpuInterval: { min: 250, max: 60_000 },
  fpsInterval: { min: 250, max: 60_000 },
  memoryWarningThreshold: { min: 1, max: 65_536 },
  memoryCriticalThreshold: { min: 1, max: 65_536 },
  maxLogEntries: { min: 100, max: 100_000 },
};

const STORAGE_KEY = 'android-debugger:app-settings';

function clampNumber(key: NumericSettingKey, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_APP_SETTINGS[key];
  const { min, max } = SETTING_LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitize(raw: unknown): AppSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_APP_SETTINGS };
  for (const key of Object.keys(SETTING_LIMITS) as NumericSettingKey[]) {
    if (key in source) result[key] = clampNumber(key, source[key]);
  }
  for (const key of ['autoStartLogcat', 'autoStartMonitoring', 'autoSelectBootedEmulator', 'emulatorNoAudio'] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  return result;
}

function load(): AppSettings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

let current: AppSettings = load();
const listeners = new Set<() => void>();

export function getAppSettings(): AppSettings {
  return current;
}

export function updateAppSettings(patch: Partial<AppSettings>): void {
  const next = sanitize({ ...current, ...patch });
  if ((Object.keys(next) as (keyof AppSettings)[]).every((key) => next[key] === current[key])) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getAppSettings);
}
