import { useState, useEffect, useCallback, useRef } from 'react';
import type { AlarmMonitorInfo, Device } from '@android-debugger/shared';
import { ALARM_MONITOR_POLL_INTERVAL } from '@android-debugger/shared';

export function useAlarmMonitor(device: Device | null, packageName?: string) {
  const [data, setData] = useState<AlarmMonitorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  // Bumped whenever the target changes so responses for a previous
  // device/package are discarded.
  const targetGenerationRef = useRef(0);
  const inFlightRef = useRef(false);
  const deviceId = device?.id;

  // Fetch scheduled alarms
  const fetchAlarms = useCallback(async () => {
    if (!deviceId) return;

    const generation = targetGenerationRef.current;
    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getScheduledAlarms(deviceId, packageName);
      if (generation !== targetGenerationRef.current) return;
      setData(result);
    } catch (err) {
      if (generation !== targetGenerationRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduled alarms');
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

    fetchAlarms();
    const interval = setInterval(() => {
      // Skip a tick if the previous request is still running
      if (!inFlightRef.current) fetchAlarms();
    }, ALARM_MONITOR_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [isPolling, deviceId, fetchAlarms]);

  // Calculate time until next alarm
  const getTimeUntilNextAlarm = useCallback(() => {
    if (!data?.nextAlarmTime) return null;
    const now = Date.now();
    const diff = data.nextAlarmTime - now;
    if (diff <= 0) return 'now';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }, [data?.nextAlarmTime]);

  return {
    data,
    isLoading,
    error,
    isPolling,
    refresh: fetchAlarms,
    startPolling,
    stopPolling,
    clearData,
    getTimeUntilNextAlarm,
  };
}
