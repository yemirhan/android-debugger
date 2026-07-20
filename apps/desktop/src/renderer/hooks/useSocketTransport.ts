import { useEffect, useRef, useState } from 'react';
import type { Device } from '@android-debugger/shared';

export type TransportType = 'socket' | 'logcat' | 'none';

/**
 * Hook that auto-connects the socket transport when a device is selected.
 * Sets up ADB port forwarding and connects to the native TCP server.
 * Falls back to logcat silently if socket connection fails.
 */
export function useSocketTransport(device: Device | null) {
  const deviceIdRef = useRef<string | null>(null);
  const [transportType, setTransportType] = useState<TransportType>('none');

  useEffect(() => {
    if (device) {
      deviceIdRef.current = device.id;
      window.electronAPI.socketConnect(device.id, '');
    }

    return () => {
      if (deviceIdRef.current) {
        window.electronAPI.socketDisconnect();
        deviceIdRef.current = null;
      }
    };
  }, [device?.id]);

  // Listen for transport status changes
  useEffect(() => {
    if (!device) {
      setTransportType('none');
      return;
    }

    setTransportType('logcat');

    const unsubscribe = window.electronAPI.onSocketStatusChanged((status: { type: TransportType }) => {
      setTransportType(status.type);
    });

    return unsubscribe;
  }, [device?.id]);

  return transportType;
}
