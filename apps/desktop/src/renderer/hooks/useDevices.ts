import { useState, useEffect, useCallback, useRef } from 'react';
import type { Device } from '@android-debugger/shared';
import { DEVICE_POLL_INTERVAL } from '@android-debugger/shared';

declare global {
  interface Window {
    electronAPI: typeof import('../../preload/index').default;
  }
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const result = await window.electronAPI.getDevices();
      setDevices(result);
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
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
