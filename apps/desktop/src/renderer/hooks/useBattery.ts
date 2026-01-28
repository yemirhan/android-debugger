import { useState, useEffect, useCallback } from 'react';
import type { BatteryInfo, Device } from '@android-debugger/shared';
import { MAX_BATTERY_DATA_POINTS } from '@android-debugger/shared';

export function useBattery(device: Device | null) {
  const [data, setData] = useState<BatteryInfo[]>([]);
  const [current, setCurrent] = useState<BatteryInfo | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (!device) return;

    window.electronAPI.startBatteryMonitor(device.id);
    setIsMonitoring(true);
  }, [device]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
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

  // Stop monitoring when device changes
  useEffect(() => {
    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, [device?.id, isMonitoring, stopMonitoring]);

  // Auto-start monitoring when device is set
  useEffect(() => {
    if (device && !isMonitoring) {
      clearData();
      startMonitoring();
    }
  }, [device]);

  return {
    data,
    current,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
  };
}
