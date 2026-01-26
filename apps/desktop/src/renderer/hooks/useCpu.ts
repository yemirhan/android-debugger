import { useState, useEffect, useCallback } from 'react';
import type { CpuInfo, Device } from '@android-debugger/shared';
import { MAX_CPU_DATA_POINTS } from '@android-debugger/shared';

export function useCpu(device: Device | null, packageName: string) {
  const [data, setData] = useState<CpuInfo[]>([]);
  const [current, setCurrent] = useState<CpuInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    window.electronAPI.startCpuMonitor(device.id, packageName);
    setIsMonitoring(true);
  }, [device, packageName]);

  const stopMonitoring = useCallback(() => {
    window.electronAPI.stopCpuMonitor();
    setIsMonitoring(false);
  }, []);

  const clearData = useCallback(() => {
    setData([]);
    setCurrent(null);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onCpuUpdate((info: CpuInfo) => {
      setCurrent(info);
      setData((prev) => {
        const newData = [...prev, info];
        if (newData.length > MAX_CPU_DATA_POINTS) {
          return newData.slice(-MAX_CPU_DATA_POINTS);
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
