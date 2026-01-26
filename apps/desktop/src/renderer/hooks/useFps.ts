import { useState, useEffect, useCallback } from 'react';
import type { FpsInfo, Device } from '@android-debugger/shared';
import { MAX_FPS_DATA_POINTS } from '@android-debugger/shared';

export function useFps(device: Device | null, packageName: string) {
  const [data, setData] = useState<FpsInfo[]>([]);
  const [current, setCurrent] = useState<FpsInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    window.electronAPI.startFpsMonitor(device.id, packageName);
    setIsMonitoring(true);
  }, [device, packageName]);

  const stopMonitoring = useCallback(() => {
    window.electronAPI.stopFpsMonitor();
    setIsMonitoring(false);
  }, []);

  const clearData = useCallback(() => {
    setData([]);
    setCurrent(null);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFpsUpdate((info: FpsInfo) => {
      setCurrent(info);
      setData((prev) => {
        const newData = [...prev, info];
        if (newData.length > MAX_FPS_DATA_POINTS) {
          return newData.slice(-MAX_FPS_DATA_POINTS);
        }
        return newData;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, [device?.id, packageName, isMonitoring, stopMonitoring]);

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
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
