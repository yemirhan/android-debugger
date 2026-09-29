import type { Device } from '@android-debugger/shared';
import { monitorControls, useMonitor } from '../lib/monitoring/monitors';

/** Battery of the selected device, collected in the background (lib/monitoring). */
export function useBattery(_device?: Device | null) {
  const { entries, current, running } = useMonitor('battery');
  return {
    data: entries,
    current,
    isMonitoring: running,
    ...monitorControls('battery'),
  };
}
