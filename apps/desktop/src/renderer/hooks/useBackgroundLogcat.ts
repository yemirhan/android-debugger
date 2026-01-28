import { useEffect, useRef } from 'react';
import type { Device } from '@android-debugger/shared';

/**
 * Hook that manages background logcat streaming.
 * This ensures logcat is always running when a device is selected,
 * so SDK messages are captured regardless of which panel is active.
 */
export function useBackgroundLogcat(device: Device | null) {
  const isStreamingRef = useRef(false);
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Start logcat when device is selected
    if (device && device.id !== deviceIdRef.current) {
      // Stop previous stream if any
      if (isStreamingRef.current) {
        window.electronAPI.stopLogcat();
      }

      // Start new stream
      window.electronAPI.startLogcat(device.id);
      isStreamingRef.current = true;
      deviceIdRef.current = device.id;
    }

    // Stop logcat when device is deselected
    if (!device && isStreamingRef.current) {
      window.electronAPI.stopLogcat();
      isStreamingRef.current = false;
      deviceIdRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (isStreamingRef.current) {
        window.electronAPI.stopLogcat();
        isStreamingRef.current = false;
      }
    };
  }, [device?.id]);

  return {
    isStreaming: isStreamingRef.current,
  };
}
