import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_METRO_PORT,
  parseMetroPort,
  type MetroProbe,
} from '../../main/rn-devtools-protocol';

const PORT_STORAGE_KEY = 'android-debugger:rn-devtools-port';

function loadPort(): number {
  try {
    return parseMetroPort(localStorage.getItem(PORT_STORAGE_KEY) ?? '') ?? DEFAULT_METRO_PORT;
  } catch {
    return DEFAULT_METRO_PORT;
  }
}

let currentPort = loadPort();
const portListeners = new Set<() => void>();

export function setMetroPort(port: number): void {
  const valid = parseMetroPort(port);
  if (!valid || valid === currentPort) return;
  currentPort = valid;
  try {
    localStorage.setItem(PORT_STORAGE_KEY, String(valid));
  } catch {
    // Persistence is best-effort
  }
  portListeners.forEach((listener) => listener());
}

/** The Metro port the React Native DevTools tab talks to, remembered across launches. */
export function useMetroPort(): number {
  return useSyncExternalStore(
    (listener) => {
      portListeners.add(listener);
      return () => portListeners.delete(listener);
    },
    () => currentPort
  );
}

const ACTIVE_POLL_MS = 2000;
const BACKGROUND_POLL_MS = 6000;

/**
 * Polls Metro for debuggable targets through the main process (the renderer's
 * CSP and CORS would block talking to Metro directly). Polls quickly while the
 * tab is visible and slowly in the background so a kept-alive DevTools
 * session can follow an app restart.
 */
export function useMetroProbe(port: number, active: boolean) {
  const [probe, setProbe] = useState<MetroProbe | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestGeneration = generation.current;
    setChecking(true);
    try {
      const result = await window.electronAPI.rnDevtools.probe(port);
      if (requestGeneration === generation.current) setProbe(result);
    } catch {
      if (requestGeneration === generation.current) setProbe({ state: 'not-running', port });
    } finally {
      inFlight.current = false;
      if (requestGeneration === generation.current) setChecking(false);
    }
  }, [port]);

  // A new port invalidates whatever the old one reported.
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setProbe(null);
  }, [port]);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), active ? ACTIVE_POLL_MS : BACKGROUND_POLL_MS);
    return () => clearInterval(timer);
  }, [check, active]);

  return { probe, checking, refresh: check };
}

/** Whether the selected device forwards its tcp:<port> to this machine (adb reverse). */
export function useReverseStatus(deviceId: string | null, port: number, active: boolean) {
  const [reversed, setReversed] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!deviceId) {
      setReversed(null);
      return;
    }
    try {
      setReversed(await window.electronAPI.rnDevtools.isReversed(deviceId, port));
    } catch {
      setReversed(null);
    }
  }, [deviceId, port]);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [refresh, active]);

  const reverse = useCallback(async () => {
    if (!deviceId) return { ok: false, error: 'Pick a device first' };
    const result = await window.electronAPI.rnDevtools.reverse(deviceId, port);
    await refresh();
    return result;
  }, [deviceId, port, refresh]);

  return { reversed, reverse, refresh };
}
