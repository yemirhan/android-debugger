import { useSyncExternalStore } from 'react';

/**
 * Lightweight app-wide toasts for command feedback.
 *
 * A module-level store (like app-settings) so any code — React or not — can
 * raise a toast without a provider. Render <Toaster /> once near the root.
 */

export type ToastKind = 'success' | 'error' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  actions?: ToastAction[];
  /** Auto-dismiss delay in ms; 0 keeps it until dismissed or updated. */
  duration: number;
}

export type ToastInput = Omit<Toast, 'id' | 'duration'> & { duration?: number };

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  error: 8000,
  loading: 0,
};

const MAX_TOASTS = 4;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function showToast(input: ToastInput): number {
  const id = nextId++;
  const toast: Toast = { ...input, id, duration: input.duration ?? DEFAULT_DURATION[input.kind] };
  toasts = [...toasts, toast].slice(-MAX_TOASTS);
  emit();
  return id;
}

/** Replaces a toast's content in place (e.g. loading → success) and restarts its timer. */
export function updateToast(id: number, patch: Partial<ToastInput>): void {
  let found = false;
  toasts = toasts.map((toast) => {
    if (toast.id !== id) return toast;
    found = true;
    const kind = patch.kind ?? toast.kind;
    const duration = patch.duration ?? (patch.kind ? DEFAULT_DURATION[kind] : toast.duration);
    return { ...toast, ...patch, kind, duration };
  });
  if (!found && patch.kind && patch.title) {
    showToast(patch as ToastInput);
    return;
  }
  emit();
}

export function dismissToast(id: number): void {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

type ToastOptions = Omit<ToastInput, 'kind' | 'title'>;

export const toast = {
  success: (title: string, options: ToastOptions = {}) => showToast({ ...options, kind: 'success', title }),
  error: (title: string, options: ToastOptions = {}) => showToast({ ...options, kind: 'error', title }),
  info: (title: string, options: ToastOptions = {}) => showToast({ ...options, kind: 'info', title }),
  loading: (title: string, options: ToastOptions = {}) => showToast({ ...options, kind: 'loading', title }),
};

/**
 * Turns IPC / adb errors into the actual reason. Electron wraps handler errors
 * as "Error invoking remote method 'x': Error: reason", and execFile errors
 * start with "Command failed: adb -s … <args>" followed by stderr.
 */
export function describeError(error: unknown): string {
  let message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  message = message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(?:\w*Error:\s*)+/, '');
  if (/^Command failed:/.test(message)) {
    const lines = message.split('\n').map((line) => line.trim()).filter(Boolean);
    const detail = lines.slice(1).pop();
    message = detail ?? 'The adb command failed';
  }
  if (/ETIMEDOUT|timed out|SIGTERM/i.test(message)) return 'The device did not respond in time';
  if (/device '.*' not found|device offline|no devices/i.test(message)) return 'The device is no longer connected';
  return message.trim() || 'Something went wrong';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Toast[] {
  return toasts;
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
