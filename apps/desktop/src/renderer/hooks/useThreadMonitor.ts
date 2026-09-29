import type { Device } from '@android-debugger/shared';
import { monitorControls, useMonitor } from '../lib/monitoring/monitors';

/** Thread snapshots of the selected app, collected in the background (lib/monitoring). */
export function useThreadMonitor(_device?: Device | null, _packageName?: string) {
  const { entries, current, running } = useMonitor('threads');
  return {
    snapshots: entries,
    current,
    isMonitoring: running,
    ...monitorControls('threads'),
  };
}
