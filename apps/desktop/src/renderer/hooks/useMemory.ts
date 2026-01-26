import { useState, useEffect, useCallback, useRef } from 'react';
import type { MemoryInfo, Device } from '@android-debugger/shared';
import { MAX_MEMORY_DATA_POINTS, MEMORY_WARNING_THRESHOLD, MEMORY_CRITICAL_THRESHOLD } from '@android-debugger/shared';

export interface MemoryAlert {
  type: 'warning' | 'critical';
  message: string;
  timestamp: number;
}

export function useMemory(device: Device | null, packageName: string) {
  const [data, setData] = useState<MemoryInfo[]>([]);
  const [current, setCurrent] = useState<MemoryInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alert, setAlert] = useState<MemoryAlert | null>(null);
  const previousMemoryRef = useRef<number | null>(null);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    window.electronAPI.startMemoryMonitor(device.id, packageName);
    setIsMonitoring(true);
  }, [device, packageName]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
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
      setCurrent(info);
      setData((prev) => {
        const newData = [...prev, info];
        // Keep only the last N data points
        if (newData.length > MAX_MEMORY_DATA_POINTS) {
          return newData.slice(-MAX_MEMORY_DATA_POINTS);
        }
        return newData;
      });

      // Check for memory alerts
      const totalMB = info.totalPss / 1024;
      if (totalMB > MEMORY_CRITICAL_THRESHOLD) {
        setAlert({
          type: 'critical',
          message: `Memory critical: ${totalMB.toFixed(0)}MB`,
          timestamp: Date.now(),
        });
      } else if (totalMB > MEMORY_WARNING_THRESHOLD) {
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

  // Stop monitoring when device or package changes
  useEffect(() => {
    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, [device?.id, packageName, isMonitoring, stopMonitoring]);

  // Auto-start monitoring when package is set
  useEffect(() => {
    if (device && packageName && !isMonitoring) {
      clearData();
      startMonitoring();
    }
  }, [device, packageName]);

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
