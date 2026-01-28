import { useState, useEffect, useCallback } from 'react';
import type { AppNetworkStats, Device } from '@android-debugger/shared';
import { MAX_NETWORK_STATS_DATA_POINTS } from '@android-debugger/shared';

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

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (!device || !packageName) return;

    window.electronAPI.startNetworkStatsMonitor(device.id, packageName);
    setIsMonitoring(true);
  }, [device, packageName]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
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

  // Initial fetch
  useEffect(() => {
    if (device) {
      fetchStats();
    }
  }, [device, packageName]);

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
