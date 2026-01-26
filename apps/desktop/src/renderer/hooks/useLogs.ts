import { useState, useEffect, useCallback, useRef } from 'react';
import type { LogEntry, LogLevel, Device } from '@android-debugger/shared';
import { MAX_LOG_ENTRIES } from '@android-debugger/shared';

export interface LogFilter {
  search: string;
  levels: Set<LogLevel>;
  tags: string[];
}

export function useLogs(device: Device | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [filter, setFilter] = useState<LogFilter>({
    search: '',
    levels: new Set(['V', 'D', 'I', 'W', 'E', 'F'] as LogLevel[]),
    tags: [],
  });
  const [isPaused, setIsPaused] = useState(false);
  const pausedLogsRef = useRef<LogEntry[]>([]);

  // Start streaming logs
  const startStreaming = useCallback((filters?: string[]) => {
    if (!device) return;

    window.electronAPI.startLogcat(device.id, filters);
    setIsStreaming(true);
  }, [device]);

  // Stop streaming logs
  const stopStreaming = useCallback(() => {
    window.electronAPI.stopLogcat();
    setIsStreaming(false);
  }, []);

  // Clear logs
  const clearLogs = useCallback(async () => {
    if (device) {
      await window.electronAPI.clearLogcat(device.id);
    }
    setLogs([]);
    pausedLogsRef.current = [];
  }, [device]);

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

  // Update filter
  const updateFilter = useCallback((newFilter: Partial<LogFilter>) => {
    setFilter((prev) => ({ ...prev, ...newFilter }));
  }, []);

  // Toggle log level
  const toggleLevel = useCallback((level: LogLevel) => {
    setFilter((prev) => {
      const newLevels = new Set(prev.levels);
      if (newLevels.has(level)) {
        newLevels.delete(level);
      } else {
        newLevels.add(level);
      }
      return { ...prev, levels: newLevels };
    });
  }, []);

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

  // Auto-start streaming when device is selected
  useEffect(() => {
    if (device && !isStreaming) {
      startStreaming();
    }

    return () => {
      if (isStreaming) {
        stopStreaming();
      }
    };
  }, [device?.id]);

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    // Filter by level
    if (!filter.levels.has(log.level)) {
      return false;
    }

    // Filter by tags
    if (filter.tags.length > 0 && !filter.tags.includes(log.tag)) {
      return false;
    }

    // Filter by search
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchLower) ||
        log.tag.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  // Export logs to file (reverse to get chronological order - oldest first)
  const exportLogs = useCallback(() => {
    const content = [...filteredLogs]
      .reverse()
      .map((log) => `${log.timestamp} ${log.level}/${log.tag}: ${log.message}`)
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  return {
    logs: filteredLogs,
    totalLogs: logs.length,
    isStreaming,
    isPaused,
    filter,
    startStreaming,
    stopStreaming,
    clearLogs,
    togglePause,
    updateFilter,
    toggleLevel,
    exportLogs,
  };
}
