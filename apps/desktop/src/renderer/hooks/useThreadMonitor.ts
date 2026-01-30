import { useState, useEffect, useCallback } from 'react';
import type { ThreadSnapshot, Device } from '@android-debugger/shared';

const THREAD_MONITOR_INTERVAL = 1000; // 1 second
const MAX_SNAPSHOTS = 60; // Keep last 60 snapshots (1 minute of data)

export function useThreadMonitor(device: Device | null, packageName: string) {
  const [snapshots, setSnapshots] = useState<ThreadSnapshot[]>([]);
  const [current, setCurrent] = useState<ThreadSnapshot | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    window.electronAPI.startThreadMonitor(device.id, packageName, THREAD_MONITOR_INTERVAL);
    setIsMonitoring(true);
  }, [device, packageName]);

  const stopMonitoring = useCallback(() => {
    window.electronAPI.stopThreadMonitor();
    setIsMonitoring(false);
  }, []);

  const clearData = useCallback(() => {
    setSnapshots([]);
    setCurrent(null);
  }, []);

  // Listen for thread updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onThreadUpdate((snapshot: ThreadSnapshot) => {
      setCurrent(snapshot);
      setSnapshots((prev) => {
        const newData = [...prev, snapshot];
        if (newData.length > MAX_SNAPSHOTS) {
          return newData.slice(-MAX_SNAPSHOTS);
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
    snapshots,
    current,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
