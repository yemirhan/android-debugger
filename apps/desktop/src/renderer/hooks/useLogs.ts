import { useState, useCallback } from 'react';
import type { LogEntry, LogLevel, Device } from '@android-debugger/shared';
import { useLogsContext } from '../contexts';

export interface LogFilter {
  search: string;
  levels: Set<LogLevel>;
  tags: string[];
}

export function useLogs(device: Device | null) {
  const { logs, isStreaming, isPaused, logMode, clearLogs: clearLogsContext, togglePause, setLogMode } = useLogsContext();

  const [filter, setFilter] = useState<LogFilter>({
    search: '',
    levels: new Set(['V', 'D', 'I', 'W', 'E', 'F'] as LogLevel[]),
    tags: [],
  });

  // Clear logs
  const clearLogs = useCallback(async () => {
    await clearLogsContext(device?.id);
  }, [device?.id, clearLogsContext]);

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

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    // Hide SDK internal messages (these are handled separately by the SDK panel)
    if (log.message.includes('SDKMSG:')) {
      return false;
    }

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
    logMode,
    filter,
    clearLogs,
    togglePause,
    setLogMode,
    updateFilter,
    toggleLevel,
    exportLogs,
  };
}
