import { useEffect } from 'react';
import type { Device } from '@android-debugger/shared';

/**
 * Keeps the SDK transports running while a device is selected (the WebSocket
 * bridge for SDK 2+, logcat for SDK 1.x), so SDK messages are captured
 * regardless of which panel is active.
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
