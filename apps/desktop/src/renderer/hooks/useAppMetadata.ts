import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppMetadata, Device } from '@android-debugger/shared';

export function useAppMetadata(device: Device | null, packageName: string) {
  const [metadata, setMetadata] = useState<AppMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const deviceId = device?.id;

  const fetchMetadata = useCallback(async () => {
    // Invalidate any in-flight request so a slow response for a previous
    // device/package cannot overwrite the current one.
    const requestId = ++requestIdRef.current;

    if (!deviceId || !packageName) {
      setMetadata(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getAppMetadata(deviceId, packageName);
      if (requestId !== requestIdRef.current) return;
      setMetadata(result);
      if (!result) {
        setError('Failed to fetch app metadata');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
      setMetadata(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [deviceId, packageName]);

  const refresh = useCallback(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Fetch metadata when device or package changes
  useEffect(() => {
    setMetadata(null);
    fetchMetadata();
  }, [fetchMetadata]);

  return {
    metadata,
    loading,
    error,
    refresh,
  };
}
