import { useEffect } from 'react';
import type { Device } from '@android-debugger/shared';

/**
 * Hook that manages background logcat streaming.
 * This ensures logcat is always running when a device is selected,
 * so SDK messages are captured regardless of which panel is active.
 */
export function useBackgroundLogcat(device: Device | null, packageName: string) {
  useEffect(() => {
    if (!device) return;
    window.electronAPI.startSdkLogcat(device.id, packageName || undefined);
    return () => {
      window.electronAPI.stopSdkLogcat();
    };
  }, [device?.id, packageName]);

  return {
    isStreaming: Boolean(device),
  };
}
