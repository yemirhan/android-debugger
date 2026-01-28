import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { LogEntry } from '@android-debugger/shared';
import { MAX_LOG_ENTRIES } from '@android-debugger/shared';

interface LogsContextValue {
  logs: LogEntry[];
  isStreaming: boolean;
  isPaused: boolean;
  clearLogs: (deviceId?: string) => Promise<void>;
  togglePause: () => void;
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
}

export function LogsProvider({ children, selectedDevice }: LogsProviderProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pausedLogsRef = useRef<LogEntry[]>([]);

  // Clear logs
  const clearLogs = useCallback(async (deviceId?: string) => {
    const id = deviceId || selectedDevice?.id;
    if (id) {
      await window.electronAPI.clearLogcat(id);
    }
    setLogs([]);
    pausedLogsRef.current = [];
  }, [selectedDevice?.id]);

  // Pause/resume
  const togglePause = useCallback(() => {
    if (isPaused) {
      // Resume: merge paused logs into main logs (paused logs are newer, go to front)
      setLogs((prev) => {
        const merged = [...pausedLogsRef.current, ...prev];
        pausedLogsRef.current = [];
        if (merged.length > MAX_LOG_ENTRIES) {
          return merged.slice(0, MAX_LOG_ENTRIES);
        }
        return merged;
      });
    }
    setIsPaused((prev) => !prev);
  }, [isPaused]);

  // Listen for log entries - new logs added to beginning (newest first)
  useEffect(() => {
    const unsubscribe = window.electronAPI.onLogEntry((entry: LogEntry) => {
      if (isPaused) {
        // Store in paused buffer (newest first)
        pausedLogsRef.current.unshift(entry);
        if (pausedLogsRef.current.length > MAX_LOG_ENTRIES) {
          pausedLogsRef.current = pausedLogsRef.current.slice(0, MAX_LOG_ENTRIES);
        }
      } else {
        setLogs((prev) => {
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
  }, [isPaused]);

  // Track streaming status based on device
  useEffect(() => {
    if (selectedDevice) {
      setIsStreaming(true);
    } else {
      setIsStreaming(false);
    }
  }, [selectedDevice?.id]);

  const value: LogsContextValue = {
    logs,
    isStreaming,
    isPaused,
    clearLogs,
    togglePause,
  };

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}
