import { useState, useEffect, useCallback, useRef } from 'react';
import type { Device } from '@android-debugger/shared';
import { DEVICE_POLL_INTERVAL } from '@android-debugger/shared';

/**
 * Polls `adb devices` (plus model / Android version / current Wi-Fi) every
 * DEVICE_POLL_INTERVAL.
 *
 * Polls never overlap: the next one is scheduled only after the previous one
 * settles. The old setInterval version started a new request every 3 s and
 * discarded any response older than the newest request, so on a device where
 * a poll takes longer than 3 s (slow `dumpsys`, two devices, Wi-Fi adb) every
 * response was thrown away and the header never saw Wi-Fi changes.
 */
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const lastSerializedRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const disposedRef = useRef(false);

  const fetchDevices = useCallback((): Promise<void> => {
    // Coalesce concurrent callers (manual refresh during a poll) onto one request.
    if (inFlightRef.current) return inFlightRef.current;
    const request = (async () => {
      try {
        const result = await window.electronAPI.getDevices();
        if (disposedRef.current) return;
        // Avoid re-rendering the whole app every poll when nothing changed.
        const serialized = JSON.stringify(result);
        if (serialized !== lastSerializedRef.current) {
          lastSerializedRef.current = serialized;
          setDevices(result);
        }
      } catch (error) {
        console.error('Error fetching devices:', error);
      } finally {
        inFlightRef.current = null;
        if (!disposedRef.current) setLoading(false);
      }
    })();
    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    // Local flag: under StrictMode the effect mounts twice and each run must
    // stop its own loop without affecting the other.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(async () => {
        await fetchDevices();
        if (!cancelled) schedule();
      }, DEVICE_POLL_INTERVAL);
    };
    void fetchDevices().then(() => {
      if (!cancelled) schedule();
    });

    return () => {
      cancelled = true;
      disposedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchDevices]);

  const refresh = useCallback(async () => {
    setLoading(true);
    // A poll already in flight may have started before the change the user
    // is refreshing for; wait for it, then ask again.
    if (inFlightRef.current) await inFlightRef.current;
    await fetchDevices();
  }, [fetchDevices]);

  return { devices, loading, refresh };
}
