import { useMemo } from 'react';
import type { GcEvent, GcStats, Device } from '@android-debugger/shared';
import { monitorControls, useMonitor } from '../lib/monitoring/monitors';

export function gcStatsFor(events: readonly GcEvent[]): GcStats {
  if (events.length === 0) {
    return {
      totalGcCount: 0,
      totalPauseTime: 0,
      avgPauseTime: 0,
      allocationRate: 0,
    };
  }

  const totalPauseTime = events.reduce((sum, e) => sum + e.pauseTimeMs, 0);
  const avgPauseTime = totalPauseTime / events.length;

  // Allocation rate: bytes freed per second over the observation period
  const totalFreed = events.reduce((sum, e) => sum + e.freedBytes, 0);
  const timeSpan = events.length > 1
    ? (events[events.length - 1].timestamp - events[0].timestamp) / 1000
    : 1;
  const allocationRate = totalFreed / Math.max(timeSpan, 1);

  return {
    totalGcCount: events.length,
    totalPauseTime,
    avgPauseTime,
    allocationRate,
  };
}

/** GC events of the selected app, collected in the background (lib/monitoring). */
export function useGcMonitor(_device?: Device | null, _packageName?: string) {
  const { entries, running } = useMonitor('gc');
  const stats = useMemo(() => gcStatsFor(entries), [entries]);

  return {
    events: entries,
    stats,
    isMonitoring: running,
    ...monitorControls('gc'),
  };
}
