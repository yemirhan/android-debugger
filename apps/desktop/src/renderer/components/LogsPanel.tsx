import React, { useRef, useEffect, useCallback } from 'react';
import type { Device, LogLevel } from '@android-debugger/shared';
import { LOG_LEVEL_COLORS } from '@android-debugger/shared';
import { useLogs } from '../hooks/useLogs';

interface LogsPanelProps {
  device: Device;
}

const LOG_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  V: 'Verbose',
  D: 'Debug',
  I: 'Info',
  W: 'Warning',
  E: 'Error',
  F: 'Fatal',
  S: 'Silent',
};

export function LogsPanel({ device }: LogsPanelProps) {
  const {
    logs,
    totalLogs,
    isStreaming,
    isPaused,
    filter,
    clearLogs,
    togglePause,
    updateFilter,
    toggleLevel,
    exportLogs,
  } = useLogs(device);

  const containerRef = useRef<HTMLDivElement>(null);
  const isAtTopRef = useRef(true);
  const prevLogsLengthRef = useRef(0);

  // Keep scroll position stable when new logs are added at top
  useEffect(() => {
    if (!containerRef.current || isPaused) return;

    const container = containerRef.current;
    const newLogsCount = logs.length - prevLogsLengthRef.current;

    // Only adjust if logs were added (not removed/filtered)
    if (newLogsCount > 0 && !isAtTopRef.current) {
      // User has scrolled down - maintain their position by scrolling down
      // to account for new content added at the top
      // We need to calculate how much height was added
      // This is approximate - works well for same-height rows
      const rowHeight = 28; // approximate row height in pixels
      container.scrollTop += newLogsCount * rowHeight;
    }
    // If user is at top, they stay at top automatically (scrollTop = 0)

    prevLogsLengthRef.current = logs.length;
  }, [logs, isPaused]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      // User is "at top" if scrollTop is near 0
      isAtTopRef.current = containerRef.current.scrollTop < 10;
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Logs</h2>
          <span className="text-sm text-text-muted">
            {logs.length.toLocaleString()} / {totalLogs.toLocaleString()} entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              isPaused
                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                : 'bg-surface-hover text-text-primary hover:bg-border'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border transition-colors"
          >
            Clear
          </button>
          <button
            onClick={exportLogs}
            className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={filter.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            placeholder="Search logs..."
            className="w-full px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary placeholder-text-muted outline-none focus:border-violet-500"
          />
        </div>

        {/* Level filters */}
        <div className="flex items-center gap-1">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              title={LOG_LEVEL_NAMES[level]}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                filter.levels.has(level)
                  ? 'text-white'
                  : 'text-text-muted opacity-40'
              }`}
              style={{
                backgroundColor: filter.levels.has(level)
                  ? LOG_LEVEL_COLORS[level] + '30'
                  : 'transparent',
                borderColor: LOG_LEVEL_COLORS[level],
                borderWidth: filter.levels.has(level) ? '1px' : '0px',
              }}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Streaming status */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-hover">
          <div
            className={`w-2 h-2 rounded-full ${
              isStreaming ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-text-muted">
            {isStreaming ? 'Streaming' : 'Stopped'}
          </span>
        </div>
      </div>

      {/* Logs list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-surface rounded-xl border border-border overflow-y-auto font-mono text-xs"
      >
        <table className="w-full">
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className={`log-${log.level} hover:bg-surface-hover border-b border-border/50`}
              >
                <td className="px-3 py-1 text-text-muted whitespace-nowrap w-[140px]">
                  {log.timestamp}
                </td>
                <td
                  className="px-2 py-1 font-bold w-6 text-center"
                  style={{ color: LOG_LEVEL_COLORS[log.level] }}
                >
                  {log.level}
                </td>
                <td className="px-2 py-1 text-cyan-400 whitespace-nowrap max-w-[150px] truncate">
                  {log.tag}
                </td>
                <td className="px-3 py-1 text-text-primary break-all">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-muted">
            No logs to display
          </div>
        )}
      </div>

      {/* Paused indicator */}
      {isPaused && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
          Log streaming paused - new logs buffered
        </div>
      )}
    </div>
  );
}
