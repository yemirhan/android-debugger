import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { LogEntry } from '@android-debugger/shared';
import { getAppSettings, useAppSettings } from '../lib/app-settings';

export type LogMode = 'rn' | 'all';

interface LogsContextValue {
  logs: LogEntry[];
  isStreaming: boolean;
  isPaused: boolean;
  logMode: LogMode;
  clearLogs: (deviceId?: string) => Promise<void>;
  togglePause: () => void;
  // Start/stop the visible log stream (auto-started unless disabled in Settings).
  startStreaming: () => void;
  stopStreaming: () => void;
  setLogMode: (mode: LogMode) => void;
}

const LogsContext = createContext<LogsContextValue | null>(null);

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

export function LogsProvider({ children, selectedDevice, packageName }: LogsProviderProps) {
  // Separate log buffers for each mode
  const [rnLogs, setRnLogs] = useState<LogEntry[]>([]);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logMode, setLogModeState] = useState<LogMode>('rn');
  const pausedRnLogsRef = useRef<LogEntry[]>([]);
  const pausedAllLogsRef = useRef<LogEntry[]>([]);
  // Whether the user wants the visible stream running; reset from the
  // auto-start setting whenever the device changes.
  const [streamEnabled, setStreamEnabled] = useState(() => getAppSettings().autoStartLogcat);
  const { maxLogEntries } = useAppSettings();
  const maxLogEntriesRef = useRef(maxLogEntries);
  maxLogEntriesRef.current = maxLogEntries;

  // Get current logs based on mode
  const logs = logMode === 'rn' ? rnLogs : allLogs;

  // Clear logs for current mode
  const clearLogs = useCallback(async (_deviceId?: string) => {
    if (logMode === 'rn') {
      setRnLogs([]);
      pausedRnLogsRef.current = [];
    } else {
      setAllLogs([]);
      pausedAllLogsRef.current = [];
    }
  }, [logMode]);

  // Track mode switch timing to ignore stale logs
  const modeSwitchTimeRef = useRef(0);
  const logModeRef = useRef(logMode);
  const isPausedRef = useRef(isPaused);

  // Pause/resume
  const togglePause = useCallback(() => {
    if (isPaused) {
      // Resume: merge paused logs into main logs (paused logs are newer, go to front).
      // Drain the buffer outside the state updater so the updater stays pure.
      const currentPausedRef = logMode === 'rn' ? pausedRnLogsRef : pausedAllLogsRef;
      const currentSetLogs = logMode === 'rn' ? setRnLogs : setAllLogs;
      const pausedLogs = currentPausedRef.current;
      currentPausedRef.current = [];

      currentSetLogs((prev) => {
        const merged = [...pausedLogs, ...prev];
        if (merged.length > maxLogEntriesRef.current) {
          return merged.slice(0, maxLogEntriesRef.current);
        }
        return merged;
      });
    }
    // Update the ref immediately so entries arriving before the next commit
    // are routed to the correct buffer.
    isPausedRef.current = !isPaused;
    setIsPaused(!isPaused);
  }, [isPaused, logMode]);

  const streamPackageName = logMode === 'all' ? packageName : '';
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    logModeRef.current = logMode;
  }, [logMode]);

  // Switch log mode (React Native vs All App)
  const setLogMode = useCallback((mode: LogMode) => {
    if (!selectedDevice || mode === logMode) return;
    modeSwitchTimeRef.current = Date.now();
    logModeRef.current = mode;
    setLogModeState(mode);
  }, [selectedDevice, logMode]);

  // Listen for log entries - new logs added to beginning (newest first)
  useEffect(() => {
    const unsubscribe = window.electronAPI.onLogEntry((entry: LogEntry) => {
      // Ignore logs that arrive within 100ms of a mode switch (stale buffered logs)
      if (Date.now() - modeSwitchTimeRef.current < 100) {
        return;
      }

      const currentMode = logModeRef.current;
      const currentIsPaused = isPausedRef.current;
      const currentSetLogs = currentMode === 'rn' ? setRnLogs : setAllLogs;
      const currentPausedRef = currentMode === 'rn' ? pausedRnLogsRef : pausedAllLogsRef;

      if (currentIsPaused) {
        // Store in paused buffer (newest first)
        currentPausedRef.current.unshift(entry);
        if (currentPausedRef.current.length > maxLogEntriesRef.current) {
          currentPausedRef.current = currentPausedRef.current.slice(0, maxLogEntriesRef.current);
        }
      } else {
        currentSetLogs((prev) => {
          const newLogs = [entry, ...prev];
          if (newLogs.length > maxLogEntriesRef.current) {
            return newLogs.slice(0, maxLogEntriesRef.current);
          }
          return newLogs;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Own the visible log stream. SDK transport uses a separate logcat process,
  // so changing display filters cannot interrupt SDK capture.
  useEffect(() => {
    window.electronAPI.stopLogcat();
    if (!selectedDevice || !streamEnabled || (logMode === 'all' && !streamPackageName)) {
      setIsStreaming(false);
      return;
    }
    modeSwitchTimeRef.current = Date.now();
    if (logMode === 'rn') {
      window.electronAPI.startLogcat(selectedDevice.id, ['*:S', 'ReactNative:V', 'ReactNativeJS:V']);
    } else {
      window.electronAPI.startLogcat(selectedDevice.id, ['*:V'], streamPackageName);
    }
    setIsStreaming(true);
    return () => window.electronAPI.stopLogcat();
  }, [selectedDevice?.id, logMode, streamPackageName, streamEnabled]);

  const startStreaming = useCallback(() => setStreamEnabled(true), []);
  const stopStreaming = useCallback(() => setStreamEnabled(false), []);

  useEffect(() => {
    setRnLogs([]);
    setAllLogs([]);
    pausedRnLogsRef.current = [];
    pausedAllLogsRef.current = [];
    setStreamEnabled(getAppSettings().autoStartLogcat);
  }, [selectedDevice?.id]);

  // Apply a lowered log limit to what is already buffered.
  useEffect(() => {
    setRnLogs((prev) => (prev.length > maxLogEntries ? prev.slice(0, maxLogEntries) : prev));
    setAllLogs((prev) => (prev.length > maxLogEntries ? prev.slice(0, maxLogEntries) : prev));
    pausedRnLogsRef.current = pausedRnLogsRef.current.slice(0, maxLogEntries);
    pausedAllLogsRef.current = pausedAllLogsRef.current.slice(0, maxLogEntries);
  }, [maxLogEntries]);

  // "All" logs are PID-filtered for the selected package, so they must not
  // carry over to a different package.
  useEffect(() => {
    setAllLogs([]);
    pausedAllLogsRef.current = [];
  }, [packageName]);

  const value: LogsContextValue = {
    logs,
    isStreaming,
    isPaused,
    logMode,
    clearLogs,
    togglePause,
    startStreaming,
    stopStreaming,
    setLogMode,
  };

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}
