import React, { createContext, useContext, useEffect, useMemo, ReactNode } from 'react';
import { useAppSettings } from '../lib/app-settings';
import { logStore, useLogControls } from '../hooks/useLogs';

interface LogsContextValue {
  deviceId: string | null;
  packageName: string;
}

const LogsContext = createContext<LogsContextValue | null>(null);

/** The device/app the log stream is attached to. Log data lives in `logStore`. */
export function useLogsContext() {
  const context = useContext(LogsContext);
  if (!context) {
    throw new Error('useLogsContext must be used within LogsProvider');
  }
  return context;
}

interface LogsProviderProps {
  children: ReactNode;
  selectedDevice: { id: string } | null;
  packageName?: string;
}

const AUTO_RETRY_DELAY_MS = 1500;
const MAX_AUTO_RETRIES = 3;

/**
 * Owns the visible logcat stream for the whole app (it stays mounted while
 * tabs change). Incoming batches go straight into `logStore`; nothing here
 * re-renders per line.
 */
export function LogsProvider({ children, selectedDevice, packageName = '' }: LogsProviderProps) {
  const { maxLogEntries } = useAppSettings();
  const { mode, enabled, restartToken, status } = useLogControls();
  const deviceId = selectedDevice?.id ?? null;
  // Only App mode depends on the selected app.
  const streamPackage = mode === 'app' ? packageName : '';

  useEffect(() => {
    logStore.setCapacity(maxLogEntries);
  }, [maxLogEntries]);

  useEffect(() => {
    const offBatch = window.electronAPI.onLogBatch((batch) => logStore.receiveBatch(batch));
    const offStatus = window.electronAPI.onLogStreamStatus((next) => logStore.receiveStatus(next));
    return () => {
      offBatch();
      offStatus();
    };
  }, []);

  useEffect(() => {
    if (!deviceId) {
      logStore.endSession('no-device', undefined, { resumeOnReturn: true });
      return;
    }
    const target = { deviceId, mode, packageName: streamPackage };
    if (mode === 'app' && !streamPackage) {
      logStore.setIdleTarget(target, 'needs-app');
      return;
    }
    if (!enabled) {
      logStore.setIdleTarget(target, 'stopped');
      return;
    }
    const { sessionId, resumeAfterEpochMs } = logStore.beginSession(target);
    window.electronAPI.startLogStream({
      sessionId,
      deviceId,
      mode,
      packageName: streamPackage || undefined,
      resumeAfterEpochMs,
    });
    return () => {
      window.electronAPI.stopLogcat();
    };
  }, [deviceId, mode, streamPackage, enabled, restartToken]);

  // A stream that ends on its own (adb restarted, cable glitch) is resumed from
  // the last line received, a few times, before asking the user.
  useEffect(() => {
    if (status !== 'ended' || !deviceId || !enabled) return;
    if (logStore.getConsecutiveEnds() > MAX_AUTO_RETRIES) return;
    const timer = setTimeout(() => logStore.restart(true), AUTO_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, deviceId, enabled]);

  const value = useMemo(() => ({ deviceId, packageName }), [deviceId, packageName]);
  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}
