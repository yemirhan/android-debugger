import { useState, useEffect, useCallback, useRef } from 'react';
import type { CpuInfo, Device } from '@android-debugger/shared';
import { MAX_CPU_DATA_POINTS } from '@android-debugger/shared';
import { getAppSettings, useAppSettings } from '../lib/app-settings';

export function useCpu(device: Device | null, packageName: string) {
  const [data, setData] = useState<CpuInfo[]>([]);
  const [current, setCurrent] = useState<CpuInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  // Main-process monitors can emit after stop (or survive a reload); only accept
  // updates while this hook owns a running monitor.
  const activeRef = useRef(false);
  const { cpuInterval } = useAppSettings();
  // Interval the running monitor was started with, so settings changes restart it.
  const startedIntervalRef = useRef(cpuInterval);

  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    activeRef.current = true;
    startedIntervalRef.current = getAppSettings().cpuInterval;
    window.electronAPI.startCpuMonitor(device.id, packageName, startedIntervalRef.current);
    setIsMonitoring(true);
  }, [device, packageName]);

  const stopMonitoring = useCallback(() => {
    activeRef.current = false;
    window.electronAPI.stopCpuMonitor();
    setIsMonitoring(false);
  }, []);

  const clearData = useCallback(() => {
    setData([]);
    setCurrent(null);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onCpuUpdate((info: CpuInfo) => {
      if (!activeRef.current) return;
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

  // Own exactly one monitor for the current target; auto-start it unless
  // disabled in Settings (then the user starts it manually).
  useEffect(() => {
    clearData();
    const settings = getAppSettings();
    if (device && packageName && settings.autoStartMonitoring) {
      activeRef.current = true;
      startedIntervalRef.current = settings.cpuInterval;
      window.electronAPI.startCpuMonitor(device.id, packageName, settings.cpuInterval);
      setIsMonitoring(true);
    } else {
      setIsMonitoring(false);
    }
    return () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      window.electronAPI.stopCpuMonitor();
    };
  }, [device?.id, packageName, clearData]);

  // Apply a changed polling interval to a running monitor without losing data.
  useEffect(() => {
    if (!activeRef.current || !device || !packageName) return;
    if (startedIntervalRef.current === cpuInterval) return;
    startedIntervalRef.current = cpuInterval;
    window.electronAPI.startCpuMonitor(device.id, packageName, cpuInterval);
  }, [cpuInterval, device?.id, packageName]);

  return {
    data,
    current,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
