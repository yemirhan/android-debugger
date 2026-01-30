import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GcEvent, GcStats, Device } from '@android-debugger/shared';

const MAX_EVENTS = 500; // Keep last 500 GC events

export function useGcMonitor(device: Device | null, packageName: string) {
  const [events, setEvents] = useState<GcEvent[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    window.electronAPI.startGcMonitor(device.id, packageName);
    setIsMonitoring(true);
  }, [device, packageName]);

  const stopMonitoring = useCallback(() => {
    window.electronAPI.stopGcMonitor();
    setIsMonitoring(false);
  }, []);

  const clearData = useCallback(() => {
    setEvents([]);
  }, []);

  // Calculate stats from events
  const stats = useMemo<GcStats>(() => {
    if (events.length === 0) {
      return {
        totalGcCount: 0,
        totalPauseTime: 0,
        avgPauseTime: 0,
        allocationRate: 0,
      };
    }

    const totalPauseTime = events.reduce((sum, e) => sum + e.pauseTimeMs, 0);
    const avgPauseTime = totalPauseTime / events.length;

    // Calculate allocation rate (bytes freed per second over the observation period)
    const totalFreed = events.reduce((sum, e) => sum + e.freedBytes, 0);
    const timeSpan = events.length > 1
      ? (events[events.length - 1].timestamp - events[0].timestamp) / 1000
      : 1;
    const allocationRate = totalFreed / Math.max(timeSpan, 1);

    return {
      totalGcCount: events.length,
      totalPauseTime,
      avgPauseTime,
      allocationRate,
    };
  }, [events]);

  // Listen for GC events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onGcEvent((event: GcEvent) => {
      setEvents((prev) => {
        const newData = [...prev, event];
        if (newData.length > MAX_EVENTS) {
          return newData.slice(-MAX_EVENTS);
        }
        return newData;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Stop monitoring when device or package changes
  useEffect(() => {
    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, [device?.id, packageName, isMonitoring, stopMonitoring]);

  // Auto-start monitoring when device and package are set
  useEffect(() => {
    if (device && packageName && !isMonitoring) {
      clearData();
      startMonitoring();
    }
  }, [device, packageName]);

  return {
    events,
    stats,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
