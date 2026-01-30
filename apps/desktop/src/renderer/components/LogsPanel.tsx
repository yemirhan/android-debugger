import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Device, LogLevel } from '@android-debugger/shared';
import { LOG_LEVEL_COLORS } from '@android-debugger/shared';
import { useLogs } from '../hooks/useLogs';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

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

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

export function LogsPanel({ device }: LogsPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const {
    logs,
    totalLogs,
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
  } = useLogs(device);
  const guide = tabGuides['logs'];

  const containerRef = useRef<HTMLDivElement>(null);
  const isAtTopRef = useRef(true);
  const prevLogsLengthRef = useRef(0);

  // Keep scroll position stable when new logs are added at top
  useEffect(() => {
    if (!containerRef.current || isPaused) return;

    const container = containerRef.current;
    const newLogsCount = logs.length - prevLogsLengthRef.current;

    if (newLogsCount > 0 && !isAtTopRef.current) {
      const rowHeight = 28;
      container.scrollTop += newLogsCount * rowHeight;
    }

    prevLogsLengthRef.current = logs.length;
  }, [logs, isPaused]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      isAtTopRef.current = containerRef.current.scrollTop < 10;
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border-muted">
            <button
              onClick={() => setLogMode('rn')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                logMode === 'rn'
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              React Native
            </button>
            <button
              onClick={() => setLogMode('all')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                logMode === 'all'
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              All App
            </button>
          </div>
          <span className="text-xs text-text-muted font-mono">
            {logs.length.toLocaleString()} / {totalLogs.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 btn-press ${
              isPaused
                ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                : 'bg-surface text-text-secondary border border-border-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          >
            Clear
          </button>
          <button
            onClick={exportLogs}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          >
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 max-w-sm relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={filter.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 bg-surface rounded-md border border-border-muted text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Level filters */}
        <div className="flex items-center gap-1 p-1 bg-surface rounded-md border border-border-muted">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              title={LOG_LEVEL_NAMES[level]}
              className={`w-7 h-7 rounded text-xs font-medium font-mono transition-all duration-150 ${
                filter.levels.has(level)
                  ? 'text-white'
                  : 'text-text-muted opacity-50 hover:opacity-75'
              }`}
              style={{
                backgroundColor: filter.levels.has(level)
                  ? LOG_LEVEL_COLORS[level] + '25'
                  : 'transparent',
              }}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Streaming status */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-surface border border-border-muted">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isStreaming ? 'bg-accent animate-pulse-dot' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-text-muted">
            {isStreaming ? 'Live' : 'Stopped'}
          </span>
        </div>
      </div>

      {/* Logs list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-surface rounded-lg border border-border-muted overflow-y-auto"
      >
        <table className="w-full">
          <thead className="sticky top-0 bg-surface-hover border-b border-border-muted">
            <tr className="text-xs text-text-muted">
              <th className="px-3 py-2 text-left font-medium w-[130px]">Time</th>
              <th className="px-2 py-2 text-center font-medium w-8">Lvl</th>
              <th className="px-2 py-2 text-left font-medium w-[140px]">Tag</th>
              <th className="px-3 py-2 text-left font-medium">Message</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {logs.map((log) => (
              <tr
                key={log.id}
                className={`log-${log.level} hover:bg-surface-hover/50 border-b border-border-muted/50 transition-colors`}
              >
                <td className="px-3 py-1.5 text-text-muted whitespace-nowrap">
                  {log.timestamp}
                </td>
                <td
                  className="px-2 py-1.5 font-semibold text-center"
                  style={{ color: LOG_LEVEL_COLORS[log.level] }}
                >
                  {log.level}
                </td>
                <td className="px-2 py-1.5 text-cyan-400 whitespace-nowrap truncate max-w-[140px]">
                  {log.tag}
                </td>
                <td className="px-3 py-1.5 text-text-primary break-all">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            <p className="text-sm">No logs to display</p>
          </div>
        )}
      </div>

      {/* Paused indicator */}
      {isPaused && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-amber-500/15 border border-amber-500/25 rounded-lg text-amber-400 text-xs font-medium animate-fade-in">
          Streaming paused - new logs buffered
        </div>
      )}
    </div>
  );
}
