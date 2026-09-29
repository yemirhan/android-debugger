import type { Device } from '@android-debugger/shared';
import { monitorControls, useMonitor } from '../lib/monitoring/monitors';

/** CPU usage of the selected app, collected in the background (lib/monitoring). */
export function useCpu(_device?: Device | null, _packageName?: string) {
  const { entries, current, running } = useMonitor('cpu');
  return {
    data: entries,
    current,
    isMonitoring: running,
    ...monitorControls('cpu'),
  };
}
