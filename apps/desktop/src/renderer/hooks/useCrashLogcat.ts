import { useState, useEffect, useCallback } from 'react';
import type { CrashEntry, Device } from '@android-debugger/shared';
import { MAX_CRASH_ENTRIES } from '@android-debugger/shared';

export function useCrashLogcat(device: Device | null) {
  const [crashes, setCrashes] = useState<CrashEntry[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const startMonitoring = useCallback(() => {
    if (!device) return;
    window.electronAPI.startCrashLogcat(device.id);
    setIsMonitoring(true);
  }, [device]);

  const stopMonitoring = useCallback(() => {
    window.electronAPI.stopCrashLogcat();
    setIsMonitoring(false);
  }, []);

  const clearCrashes = useCallback(() => {
    setCrashes([]);
    if (device) {
      window.electronAPI.clearCrashLogcat(device.id);
    }
  }, [device]);

  // Listen for crash entries
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCrashEntry((entry: CrashEntry) => {
      setCrashes((prev) => {
        const newCrashes = [...prev, entry];
        if (newCrashes.length > MAX_CRASH_ENTRIES) {
          return newCrashes.slice(-MAX_CRASH_ENTRIES);
        }
        return newCrashes;
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
      startMonitoring();
    }
  }, [device]);

  return {
    crashes,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearCrashes,
  };
}
