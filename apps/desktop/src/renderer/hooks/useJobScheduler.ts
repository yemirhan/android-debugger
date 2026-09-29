import { useState, useEffect, useCallback, useRef } from 'react';
import type { JobSchedulerInfo, Device } from '@android-debugger/shared';
import { JOB_SCHEDULER_POLL_INTERVAL } from '@android-debugger/shared';

export function useJobScheduler(device: Device | null, packageName?: string) {
  const [data, setData] = useState<JobSchedulerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  // Bumped whenever the target changes so responses for a previous
  // device/package are discarded.
  const targetGenerationRef = useRef(0);
  const inFlightRef = useRef(false);
  const deviceId = device?.id;

  // Fetch scheduled jobs
  const fetchJobs = useCallback(async () => {
    if (!deviceId) return;

    const generation = targetGenerationRef.current;
    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getScheduledJobs(deviceId, packageName);
      if (generation !== targetGenerationRef.current) return;
      setData(result);
    } catch (err) {
      if (generation !== targetGenerationRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduled jobs');
    } finally {
      if (generation === targetGenerationRef.current) {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    }
  }, [deviceId, packageName]);

  // Start polling
  const startPolling = useCallback(() => {
    if (!deviceId) return;
    setIsPolling(true);
  }, [deviceId]);

  // Stop polling
  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  // Clear data
  const clearData = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  // Reset and auto-start polling whenever the device or package changes
  useEffect(() => {
    targetGenerationRef.current++;
    inFlightRef.current = false;
    clearData();
    setIsLoading(false);
    setIsPolling(Boolean(deviceId));
  }, [deviceId, packageName, clearData]);

  // Own the polling interval; it is torn down on stop, target change and unmount
  useEffect(() => {
    if (!isPolling || !deviceId) return;

    fetchJobs();
    const interval = setInterval(() => {
      // Skip a tick if the previous request is still running
      if (!inFlightRef.current) fetchJobs();
    }, JOB_SCHEDULER_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [isPolling, deviceId, fetchJobs]);

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
