import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppNetworkStats, Device } from '@android-debugger/shared';
import { MAX_NETWORK_STATS_DATA_POINTS } from '@android-debugger/shared';
import { getAppSettings } from '../lib/app-settings';

export interface NetworkStatsHistory {
  timestamp: number;
  wifiRx: number;
  wifiTx: number;
  mobileRx: number;
  mobileTx: number;
}

export function useNetworkStats(device: Device | null, packageName: string) {
  const [history, setHistory] = useState<NetworkStatsHistory[]>([]);
  const [current, setCurrent] = useState<AppNetworkStats | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  // Main-process monitors can emit after stop (or survive a reload); only accept
  // updates while this hook owns a running monitor.
  const activeRef = useRef(false);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    activeRef.current = true;
    window.electronAPI.startNetworkStatsMonitor(device.id, packageName);
    setIsMonitoring(true);
  }, [device, packageName]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    activeRef.current = false;
    window.electronAPI.stopNetworkStatsMonitor();
    setIsMonitoring(false);
  }, []);

  // Clear data
  const clearData = useCallback(() => {
    setHistory([]);
    setCurrent(null);
  }, []);

  // Fetch current stats once
  const fetchStats = useCallback(async () => {
    if (!device) return;

    try {
      const stats = await window.electronAPI.getNetworkStats(device.id, packageName || undefined);
      if (stats) {
        setCurrent(stats);
      }
    } catch (error) {
      console.error('Error fetching network stats:', error);
    }
  }, [device, packageName]);

  // Listen for network stats updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onNetworkStatsUpdate((stats: AppNetworkStats) => {
      if (!activeRef.current) return;
      setCurrent(stats);
      setHistory((prev) => {
        const entry: NetworkStatsHistory = {
          timestamp: Date.now(),
          wifiRx: stats.wifi.rxBytes,
          wifiTx: stats.wifi.txBytes,
          mobileRx: stats.mobile.rxBytes,
          mobileTx: stats.mobile.txBytes,
        };
        const newHistory = [...prev, entry];
        if (newHistory.length > MAX_NETWORK_STATS_DATA_POINTS) {
          return newHistory.slice(-MAX_NETWORK_STATS_DATA_POINTS);
        }
        return newHistory;
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
      window.electronAPI.startNetworkStatsMonitor(device.id, packageName);
      setIsMonitoring(true);
    } else {
      setIsMonitoring(false);
    }
    return () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      window.electronAPI.stopNetworkStatsMonitor();
    };
  }, [device?.id, packageName, clearData]);

  return {
    history,
    current,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    clearData,
    fetchStats,
  };
}
