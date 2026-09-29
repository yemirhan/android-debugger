import { useState, useEffect, useCallback, useRef } from 'react';
import type { BatteryInfo, Device } from '@android-debugger/shared';
import { MAX_BATTERY_DATA_POINTS } from '@android-debugger/shared';
import { getAppSettings } from '../lib/app-settings';

export function useBattery(device: Device | null) {
  const [data, setData] = useState<BatteryInfo[]>([]);
  const [current, setCurrent] = useState<BatteryInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  // Main-process monitors can emit after stop (or survive a reload); only accept
  // updates while this hook owns a running monitor.
  const activeRef = useRef(false);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (!device) return;

    activeRef.current = true;
    window.electronAPI.startBatteryMonitor(device.id);
    setIsMonitoring(true);
  }, [device]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    activeRef.current = false;
    window.electronAPI.stopBatteryMonitor();
    setIsMonitoring(false);
  }, []);

  // Clear data
  const clearData = useCallback(() => {
    setData([]);
    setCurrent(null);
  }, []);

  // Listen for battery updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onBatteryUpdate((info: BatteryInfo) => {
      if (!activeRef.current) return;
      setCurrent(info);
      setData((prev) => {
        const newData = [...prev, info];
        if (newData.length > MAX_BATTERY_DATA_POINTS) {
          return newData.slice(-MAX_BATTERY_DATA_POINTS);
        }
        return newData;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Own exactly one monitor for the current device; auto-start it unless
  // disabled in Settings (then the user starts it manually).
  useEffect(() => {
    clearData();
    if (device && getAppSettings().autoStartMonitoring) {
      activeRef.current = true;
      window.electronAPI.startBatteryMonitor(device.id);
      setIsMonitoring(true);
    } else {
      setIsMonitoring(false);
    }
    return () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      window.electronAPI.stopBatteryMonitor();
    };
  }, [device?.id, clearData]);

  return {
    data,
    current,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
