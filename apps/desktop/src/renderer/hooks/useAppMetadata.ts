import { useState, useEffect, useCallback } from 'react';
import type { AppMetadata, Device } from '@android-debugger/shared';

export function useAppMetadata(device: Device | null, packageName: string) {
  const [metadata, setMetadata] = useState<AppMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetadata = useCallback(async () => {
    if (!device || !packageName) {
      setMetadata(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getAppMetadata(device.id, packageName);
      setMetadata(result);
      if (!result) {
        setError('Failed to fetch app metadata');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setMetadata(null);
    } finally {
      setLoading(false);
    }
  }, [device, packageName]);

  const refresh = useCallback(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Fetch metadata when device or package changes
  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  return {
    metadata,
    loading,
    error,
    refresh,
  };
}
