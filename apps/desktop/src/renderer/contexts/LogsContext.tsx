import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { LogEntry } from '@android-debugger/shared';
import { MAX_LOG_ENTRIES } from '@android-debugger/shared';

export type LogMode = 'rn' | 'all';

interface LogsContextValue {
  logs: LogEntry[];
  isStreaming: boolean;
  isPaused: boolean;
  logMode: LogMode;
  clearLogs: (deviceId?: string) => Promise<void>;
  togglePause: () => void;
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

  // Get current logs based on mode
  const logs = logMode === 'rn' ? rnLogs : allLogs;

  // Clear logs for current mode
  const clearLogs = useCallback(async (deviceId?: string) => {
    const id = deviceId || selectedDevice?.id;
    if (id) {
      await window.electronAPI.clearLogcat(id);
    }
    if (logMode === 'rn') {
      setRnLogs([]);
      pausedRnLogsRef.current = [];
    } else {
      setAllLogs([]);
      pausedAllLogsRef.current = [];
    }
  }, [selectedDevice?.id, logMode]);

  // Pause/resume
  const togglePause = useCallback(() => {
    if (isPaused) {
      // Resume: merge paused logs into main logs (paused logs are newer, go to front)
      const currentPausedRef = logMode === 'rn' ? pausedRnLogsRef : pausedAllLogsRef;
      const currentSetLogs = logMode === 'rn' ? setRnLogs : setAllLogs;

      currentSetLogs((prev) => {
        const merged = [...currentPausedRef.current, ...prev];
        currentPausedRef.current = [];
        if (merged.length > MAX_LOG_ENTRIES) {
          return merged.slice(0, MAX_LOG_ENTRIES);
        }
        return merged;
      });
    }
    setIsPaused((prev) => !prev);
  }, [isPaused, logMode]);

  // Track mode switch timing to ignore stale logs
  const modeSwitchTimeRef = useRef(0);
  const logModeRef = useRef(logMode);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Switch log mode (React Native vs All App)
  const setLogMode = useCallback((mode: LogMode) => {
    if (!selectedDevice || mode === logMode) return;

    // Stop current logcat
    window.electronAPI.stopLogcat();

    // Record when we switched modes - ignore logs for a brief window
    modeSwitchTimeRef.current = Date.now();

    // Update mode ref synchronously BEFORE starting new logcat
    logModeRef.current = mode;

    // Set new mode state (for UI)
    setLogModeState(mode);

    // Start with new filters after a small delay to let buffered logs drain
    setTimeout(() => {
      if (mode === 'rn') {
        window.electronAPI.startLogcat(selectedDevice.id, ['*:S', 'ReactNative:V', 'ReactNativeJS:V']);
      } else {
        // 'all' mode - filter by app PID if package name is set
        window.electronAPI.startLogcat(selectedDevice.id, ['*:V'], packageName || undefined);
      }
    }, 50);
  }, [selectedDevice, logMode, packageName]);

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
        if (currentPausedRef.current.length > MAX_LOG_ENTRIES) {
          currentPausedRef.current = currentPausedRef.current.slice(0, MAX_LOG_ENTRIES);
        }
      } else {
        currentSetLogs((prev) => {
          const newLogs = [entry, ...prev];
          if (newLogs.length > MAX_LOG_ENTRIES) {
            return newLogs.slice(0, MAX_LOG_ENTRIES);
          }
          return newLogs;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Track streaming status based on device
  useEffect(() => {
    if (selectedDevice) {
      setIsStreaming(true);
    } else {
      setIsStreaming(false);
    }
  }, [selectedDevice?.id]);

  // Restart logcat when package changes while in 'all' mode (to get new PID)
  const prevPackageRef = useRef(packageName);
  useEffect(() => {
    // Only restart if package actually changed (not on initial mount or mode switch)
    if (!selectedDevice || logMode !== 'all' || prevPackageRef.current === packageName) {
      prevPackageRef.current = packageName;
      return;
    }

    prevPackageRef.current = packageName;

    // Stop current logcat
    window.electronAPI.stopLogcat();

    // Record switch time to ignore stale logs
    modeSwitchTimeRef.current = Date.now();

    // Clear only the 'all' logs buffer since the app changed
    setAllLogs([]);
    pausedAllLogsRef.current = [];

    // Start with new package PID after a small delay
    setTimeout(() => {
      window.electronAPI.startLogcat(selectedDevice.id, ['*:V'], packageName || undefined);
    }, 50);
  }, [packageName, selectedDevice?.id, logMode]);

  const value: LogsContextValue = {
    logs,
    isStreaming,
    isPaused,
    logMode,
    clearLogs,
    togglePause,
    setLogMode,
  };

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}
