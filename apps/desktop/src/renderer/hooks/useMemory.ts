import { useMemo } from 'react';
import type { MemoryInfo, Device } from '@android-debugger/shared';
import { useAppSettings } from '../lib/app-settings';
import { monitorControls, useMonitor } from '../lib/monitoring/monitors';

export interface MemoryAlert {
  type: 'warning' | 'critical';
  message: string;
  timestamp: number;
}

export function memoryAlertFor(
  info: MemoryInfo | null,
  warningMB: number,
  criticalMB: number
): MemoryAlert | null {
  if (!info) return null;
  const totalMB = info.totalPss / 1024;
  if (totalMB > criticalMB) {
    return { type: 'critical', message: `Memory critical: ${totalMB.toFixed(0)}MB`, timestamp: info.timestamp };
  }
  if (totalMB > warningMB) {
    return { type: 'warning', message: `Memory warning: ${totalMB.toFixed(0)}MB`, timestamp: info.timestamp };
  }
  return null;
}

/**
 * Memory of the selected app, collected in the background (lib/monitoring).
 * The arguments are kept for call-site compatibility; the monitor always
 * follows the app-wide selection.
 */
export function useMemory(_device?: Device | null, _packageName?: string) {
  const { entries, current, running } = useMonitor('memory');
  const { memoryWarningThreshold, memoryCriticalThreshold } = useAppSettings();
  const alert = useMemo(
    () => memoryAlertFor(current, memoryWarningThreshold, memoryCriticalThreshold),
    [current, memoryWarningThreshold, memoryCriticalThreshold]
  );

  return {
    data: entries,
    current,
    isMonitoring: running,
    alert,
    ...monitorControls('memory'),
  };
}
