import { useState, useEffect, useCallback, useRef } from 'react';
import type { FpsInfo, Device } from '@android-debugger/shared';
import { MAX_FPS_DATA_POINTS } from '@android-debugger/shared';
import { getAppSettings, useAppSettings } from '../lib/app-settings';

export function useFps(device: Device | null, packageName: string) {
  const [data, setData] = useState<FpsInfo[]>([]);
  const [current, setCurrent] = useState<FpsInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  // Main-process monitors can emit after stop (or survive a reload); only accept
  // updates while this hook owns a running monitor.
  const activeRef = useRef(false);
  const { fpsInterval } = useAppSettings();
  // Interval the running monitor was started with, so settings changes restart it.
  const startedIntervalRef = useRef(fpsInterval);

  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    activeRef.current = true;
    startedIntervalRef.current = getAppSettings().fpsInterval;
    window.electronAPI.startFpsMonitor(device.id, packageName, startedIntervalRef.current);
    setIsMonitoring(true);
  }, [device, packageName]);

  const stopMonitoring = useCallback(() => {
    activeRef.current = false;
    window.electronAPI.stopFpsMonitor();
    setIsMonitoring(false);
  }, []);

  const clearData = useCallback(() => {
    setData([]);
    setCurrent(null);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFpsUpdate((info: FpsInfo) => {
      if (!activeRef.current) return;
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

  // Own exactly one monitor for the current target; auto-start it unless
  // disabled in Settings (then the user starts it manually).
  useEffect(() => {
    clearData();
    const settings = getAppSettings();
    if (device && packageName && settings.autoStartMonitoring) {
      activeRef.current = true;
      startedIntervalRef.current = settings.fpsInterval;
      window.electronAPI.startFpsMonitor(device.id, packageName, settings.fpsInterval);
      setIsMonitoring(true);
    } else {
      setIsMonitoring(false);
    }
    return () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      window.electronAPI.stopFpsMonitor();
    };
  }, [device?.id, packageName, clearData]);

  // Apply a changed polling interval to a running monitor without losing data.
  useEffect(() => {
    if (!activeRef.current || !device || !packageName) return;
    if (startedIntervalRef.current === fpsInterval) return;
    startedIntervalRef.current = fpsInterval;
    window.electronAPI.startFpsMonitor(device.id, packageName, fpsInterval);
  }, [fpsInterval, device?.id, packageName]);

  return {
    data,
    current,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
