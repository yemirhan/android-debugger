import { useState, useEffect, useCallback, useRef } from 'react';
import type { ThreadSnapshot, Device } from '@android-debugger/shared';
import { getAppSettings } from '../lib/app-settings';

const THREAD_MONITOR_INTERVAL = 1000; // 1 second
const MAX_SNAPSHOTS = 60; // Keep last 60 snapshots (1 minute of data)

export function useThreadMonitor(device: Device | null, packageName: string) {
  const [snapshots, setSnapshots] = useState<ThreadSnapshot[]>([]);
  const [current, setCurrent] = useState<ThreadSnapshot | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  // Main-process monitors can emit after stop (or survive a reload); only accept
  // updates while this hook owns a running monitor.
  const activeRef = useRef(false);

  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    activeRef.current = true;
    window.electronAPI.startThreadMonitor(device.id, packageName, THREAD_MONITOR_INTERVAL);
    setIsMonitoring(true);
  }, [device, packageName]);

  const stopMonitoring = useCallback(() => {
    activeRef.current = false;
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
      if (!activeRef.current) return;
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

  // Own exactly one monitor for the current target; auto-start it unless
  // disabled in Settings (then the user starts it manually).
  useEffect(() => {
    clearData();
    if (device && packageName && getAppSettings().autoStartMonitoring) {
      activeRef.current = true;
      window.electronAPI.startThreadMonitor(device.id, packageName, THREAD_MONITOR_INTERVAL);
      setIsMonitoring(true);
    } else {
      setIsMonitoring(false);
    }
    return () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      window.electronAPI.stopThreadMonitor();
    };
  }, [device?.id, packageName, clearData]);

  return {
    snapshots,
    current,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
