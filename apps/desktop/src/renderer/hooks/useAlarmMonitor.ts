import { useState, useEffect, useCallback, useRef } from 'react';
import type { AlarmMonitorInfo, Device } from '@android-debugger/shared';
import { ALARM_MONITOR_POLL_INTERVAL } from '@android-debugger/shared';

export function useAlarmMonitor(device: Device | null, packageName?: string) {
  const [data, setData] = useState<AlarmMonitorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch scheduled alarms
  const fetchAlarms = useCallback(async () => {
    if (!device) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getScheduledAlarms(device.id, packageName);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduled alarms');
    } finally {
      setIsLoading(false);
    }
  }, [device, packageName]);

  // Start polling
  const startPolling = useCallback(() => {
    if (!device || isPolling) return;

    setIsPolling(true);
    fetchAlarms();

    intervalRef.current = setInterval(() => {
      fetchAlarms();
    }, ALARM_MONITOR_POLL_INTERVAL);
  }, [device, isPolling, fetchAlarms]);

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
