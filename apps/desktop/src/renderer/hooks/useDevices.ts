import { useState, useEffect, useCallback, useRef } from 'react';
import type { Device } from '@android-debugger/shared';
import { DEVICE_POLL_INTERVAL } from '@android-debugger/shared';

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);
  const lastSerializedRef = useRef<string | null>(null);

  const fetchDevices = useCallback(async () => {
    // Polls can overlap when adb is slow; only the newest request may win.
    const requestId = ++requestIdRef.current;
    try {
      const result = await window.electronAPI.getDevices();
      if (requestId !== requestIdRef.current) return;
      // Avoid re-rendering the whole app every poll when nothing changed.
      const serialized = JSON.stringify(result);
      if (serialized !== lastSerializedRef.current) {
        lastSerializedRef.current = serialized;
        setDevices(result);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchDevices();

    intervalRef.current = setInterval(fetchDevices, DEVICE_POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchDevices]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchDevices();
  }, [fetchDevices]);

  return { devices, loading, refresh };
}
