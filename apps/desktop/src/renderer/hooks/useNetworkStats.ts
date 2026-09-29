import { useCallback } from 'react';
import type { Device } from '@android-debugger/shared';
import { monitorControls, monitors, useMonitor } from '../lib/monitoring/monitors';

export type { NetworkStatsHistory } from '../lib/monitoring/monitors';

/** Network usage of the selected app, collected in the background (lib/monitoring). */
export function useNetworkStats(device: Device | null, packageName: string) {
  const { entries, current, running } = useMonitor('network-stats');
  const deviceId = device?.id;

  // One-off refresh; only shown if the same app is still selected when it lands.
  const fetchStats = useCallback(async () => {
    if (!deviceId || !packageName) return;
    const channel = monitors['network-stats'];
    const targetKey = channel.getState().targetKey;
    try {
      const stats = await window.electronAPI.getNetworkStats(deviceId, packageName);
      if (stats) channel.setCurrent(targetKey, stats);
    } catch (error) {
      console.error('Error fetching network stats:', error);
    }
  }, [deviceId, packageName]);

  return {
    history: entries,
    current,
    isMonitoring: running,
    ...monitorControls('network-stats'),
    fetchStats,
  };
}
