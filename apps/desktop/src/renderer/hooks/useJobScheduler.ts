import { useState, useEffect, useCallback, useRef } from 'react';
import type { JobSchedulerInfo, Device } from '@android-debugger/shared';
import { JOB_SCHEDULER_POLL_INTERVAL } from '@android-debugger/shared';

export function useJobScheduler(device: Device | null, packageName?: string) {
  const [data, setData] = useState<JobSchedulerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch scheduled jobs
  const fetchJobs = useCallback(async () => {
    if (!device) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getScheduledJobs(device.id, packageName);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduled jobs');
    } finally {
      setIsLoading(false);
    }
  }, [device, packageName]);

  // Start polling
  const startPolling = useCallback(() => {
    if (!device || isPolling) return;

    setIsPolling(true);
    fetchJobs();

    intervalRef.current = setInterval(() => {
      fetchJobs();
    }, JOB_SCHEDULER_POLL_INTERVAL);
  }, [device, isPolling, fetchJobs]);

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

  // Auto-start polling when device is set
  useEffect(() => {
    if (device && !isPolling) {
      clearData();
      startPolling();
    }
  }, [device, packageName]);

  return {
    data,
    isLoading,
    error,
    isPolling,
    refresh: fetchJobs,
    startPolling,
    stopPolling,
    clearData,
  };
}
