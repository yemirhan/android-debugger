import { useState, useEffect, useCallback, useRef } from 'react';
import type { ActivityStackInfo, Device } from '@android-debugger/shared';
import { ACTIVITY_STACK_POLL_INTERVAL } from '@android-debugger/shared';

export function useActivityStack(device: Device | null, packageName: string) {
  const [data, setData] = useState<ActivityStackInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch activity stack
  const fetchActivityStack = useCallback(async () => {
    if (!device || !packageName) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getActivityStack(device.id, packageName);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch activity stack');
    } finally {
      setIsLoading(false);
    }
  }, [device, packageName]);

  // Start polling
  const startPolling = useCallback(() => {
    if (!device || !packageName || isPolling) return;

    setIsPolling(true);
    fetchActivityStack();

    intervalRef.current = setInterval(() => {
      fetchActivityStack();
    }, ACTIVITY_STACK_POLL_INTERVAL);
  }, [device, packageName, isPolling, fetchActivityStack]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Clear data
  const clearData = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  // Cleanup on unmount or device/package change
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [device?.id, packageName, stopPolling]);

  // Auto-start polling when device and package are set
  useEffect(() => {
    if (device && packageName && !isPolling) {
      clearData();
      startPolling();
    }
  }, [device, packageName]);

  return {
    data,
    isLoading,
    error,
    isPolling,
    refresh: fetchActivityStack,
    startPolling,
    stopPolling,
    clearData,
  };
}
