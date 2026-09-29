import { useState, useEffect, useCallback, useRef } from 'react';
import type { MemoryInfo, Device } from '@android-debugger/shared';
import { MAX_MEMORY_DATA_POINTS } from '@android-debugger/shared';
import { getAppSettings, useAppSettings } from '../lib/app-settings';

export interface MemoryAlert {
  type: 'warning' | 'critical';
  message: string;
  timestamp: number;
}

export function useMemory(device: Device | null, packageName: string) {
  const [data, setData] = useState<MemoryInfo[]>([]);
  const [current, setCurrent] = useState<MemoryInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  // Main-process monitors can emit after stop (or survive a reload); only accept
  // updates while this hook owns a running monitor.
  const activeRef = useRef(false);
  const [alert, setAlert] = useState<MemoryAlert | null>(null);
  const previousMemoryRef = useRef<number | null>(null);
  const { memoryInterval } = useAppSettings();
  // Interval the running monitor was started with, so settings changes restart it.
  const startedIntervalRef = useRef(memoryInterval);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    activeRef.current = true;
    startedIntervalRef.current = getAppSettings().memoryInterval;
    window.electronAPI.startMemoryMonitor(device.id, packageName, startedIntervalRef.current);
    setIsMonitoring(true);
  }, [device, packageName]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    activeRef.current = false;
    window.electronAPI.stopMemoryMonitor();
    setIsMonitoring(false);
  }, []);

  // Clear data
  const clearData = useCallback(() => {
    setData([]);
    setCurrent(null);
    setAlert(null);
    previousMemoryRef.current = null;
  }, []);

  // Listen for memory updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onMemoryUpdate((info: MemoryInfo) => {
      if (!activeRef.current) return;
      setCurrent(info);
      setData((prev) => {
        const newData = [...prev, info];
        // Keep only the last N data points
        if (newData.length > MAX_MEMORY_DATA_POINTS) {
          return newData.slice(-MAX_MEMORY_DATA_POINTS);
        }
        return newData;
      });

      // Check for memory alerts (thresholds are user-configurable in Settings)
      const { memoryWarningThreshold, memoryCriticalThreshold } = getAppSettings();
      const totalMB = info.totalPss / 1024;
      if (totalMB > memoryCriticalThreshold) {
        setAlert({
          type: 'critical',
          message: `Memory critical: ${totalMB.toFixed(0)}MB`,
          timestamp: Date.now(),
        });
      } else if (totalMB > memoryWarningThreshold) {
        setAlert({
          type: 'warning',
          message: `Memory warning: ${totalMB.toFixed(0)}MB`,
          timestamp: Date.now(),
        });
      } else {
        setAlert(null);
      }

      previousMemoryRef.current = info.totalPss;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Own exactly one monitor for the current target; auto-start it unless
  // disabled in Settings (then the user starts it manually).
  useEffect(() => {
    clearData();
    const settings = getAppSettings();
    if (device && packageName && settings.autoStartMonitoring) {
      activeRef.current = true;
      startedIntervalRef.current = settings.memoryInterval;
      window.electronAPI.startMemoryMonitor(device.id, packageName, settings.memoryInterval);
      setIsMonitoring(true);
    } else {
      setIsMonitoring(false);
    }
    return () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      window.electronAPI.stopMemoryMonitor();
    };
  }, [device?.id, packageName, clearData]);

  // Apply a changed polling interval to a running monitor without losing data.
  useEffect(() => {
    if (!activeRef.current || !device || !packageName) return;
    if (startedIntervalRef.current === memoryInterval) return;
    startedIntervalRef.current = memoryInterval;
    window.electronAPI.startMemoryMonitor(device.id, packageName, memoryInterval);
  }, [memoryInterval, device?.id, packageName]);

  return {
    data,
    current,
    isMonitoring,
    alert,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
