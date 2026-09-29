import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Device, LogLevel } from '@android-debugger/shared';
import type { LogStreamMode } from '../../main/logcat-format';
import { logStore, useLogView } from '../hooks/useLogs';
import { firstIndexAfter, formatLogLine, type LogRow } from '../lib/log-filter';
import type { LogStatus, LogStoreState } from '../lib/log-store';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { EmptyState } from './shared/EmptyState';
import { tabGuides } from '../data/tabGuides';
import { LogList } from './log-viewer/LogList';
import { LogDetails } from './log-viewer/LogDetails';
import { TagFilterPopover } from './log-viewer/TagFilterPopover';

interface LogsPanelProps {
  device: Device;
  packageName: string;
}

const HISTORY_LINES = 1000;

const MODES: Array<{ id: LogStreamMode; label: string; hint: string }> = [
  { id: 'rn', label: 'React Native', hint: 'ReactNative and ReactNativeJS tags (console.log, warnings, red boxes)' },
  { id: 'app', label: 'App', hint: 'Everything the selected app logs, including native code' },
  { id: 'device', label: 'Device', hint: 'Every line the device logs' },
];

const LEVELS: Array<{ id: LogLevel; name: string }> = [
  { id: 'V', name: 'Verbose' },
  { id: 'D', name: 'Debug' },
  { id: 'I', name: 'Info' },
  { id: 'W', name: 'Warning' },
  { id: 'E', name: 'Error' },
  { id: 'F', name: 'Fatal' },
];
const LEVEL_ORDER = LEVELS.map((level) => level.id);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const LogsIconLarge = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);

interface StatusInfo {
  label: string;
  dot: string;
  pulse?: boolean;
}

function describeStatus(status: LogStatus, paused: boolean): StatusInfo {
  if (paused && (status === 'streaming' || status === 'starting')) return { label: 'Paused', dot: 'bg-amber-400' };
  switch (status) {
    case 'streaming':
      return { label: 'Streaming', dot: 'bg-signal', pulse: true };
    case 'starting':
      return { label: 'Connecting…', dot: 'bg-accent', pulse: true };
    case 'stopped':
      return { label: 'Stopped', dot: 'bg-text-muted' };
    case 'waiting-for-app':
      return { label: 'Waiting for app', dot: 'bg-amber-400' };
    case 'ended':
      return { label: 'Stream ended', dot: 'bg-log-error' };
    case 'error':
      return { label: 'Error', dot: 'bg-log-error' };
    case 'needs-app':
      return { label: 'No app chosen', dot: 'bg-text-muted' };
    case 'no-device':
    default:
      return { label: 'Device disconnected', dot: 'bg-log-error' };
  }
}

/** Saves the given lines (logcat threadtime format) through a native save dialog. */
async function exportRows(rows: readonly LogRow[], mode: LogStreamMode): Promise<string | null> {
  const content = rows.map(formatLogLine).join('\n') + '\n';
  const name = `logs-${mode}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
  try {
    const result = await window.electronAPI.exportLogs(content, name);
    return result.success && result.path ? `Saved ${rows.length.toLocaleString()} lines to ${result.path}` : null;
  } catch (error) {
    return `Export failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function LogsPanel({ device, packageName }: LogsPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { state, rows, filterError, filterActive, isFiltering, newWhilePaused } = useLogView();
  const { filter, mode, status, paused, enabled } = state;
  const guide = tabGuides['logs'];
  const statusInfo = describeStatus(status, paused);

  // ⌘F / Ctrl+F focuses the search box while the Logs view is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedRow = selectedSeq === null ? null : findBySeq(state.rows, selectedSeq);
  const handleSelect = useCallback((row: LogRow | null) => setSelectedSeq(row ? row.seq : null), []);

  const loadHistory = async () => {
    logStore.setHistoryLoading();
    const result = await window.electronAPI.loadLogHistory({
      deviceId: device.id,
      mode,
      packageName: mode === 'app' ? packageName : undefined,
      beforeEpochMs: logStore.getState().coverageStartEpochMs,
      limit: HISTORY_LINES,
    });
    logStore.prependHistory(result.entries, result.error);
  };

  const canStream = status !== 'needs-app' && status !== 'no-device';
  const historyBusy = state.history === 'loading';
  const bufferFull = state.rows.length >= state.capacity;
  const hiddenByFilter = state.rows.length > 0 && rows.length === 0 && !paused;

  const emptyState = renderEmptyState({
    state,
    packageName,
    hiddenByFilter,
    onLoadHistory: loadHistory,
    historyBusy,
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      {/* Header: source, status and stream actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-semibold">Logs</h2>
        <button
          onClick={() => setShowInfo(true)}
          className="p-1.5 -ml-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Learn more about this feature"
        >
          <InfoIcon />
        </button>

        <div role="tablist" aria-label="Log source" className="flex items-center p-0.5 rounded-md bg-background border border-border-muted">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              title={m.hint}
              onClick={() => {
                setSelectedSeq(null);
                logStore.setMode(m.id);
              }}
              className={`h-7 px-3 rounded text-sm transition-colors ${
                mode === m.id ? 'bg-surface-hover text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <span
          className="flex items-center gap-1.5 text-sm text-text-secondary"
          title={state.statusMessage ?? undefined}
        >
          <span className={`w-2 h-2 rounded-full ${statusInfo.dot} ${statusInfo.pulse ? 'animate-pulse-dot' : ''}`} />
          {statusInfo.label}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <ToolbarButton
            onClick={() => logStore.setPaused(!paused)}
            disabled={!paused && state.rows.length === 0}
            title={paused ? 'Resume the view' : 'Freeze the view; new lines keep being captured'}
            tone={paused ? 'warn' : 'default'}
          >
            {paused ? 'Resume' : 'Pause'}
          </ToolbarButton>
          <ToolbarButton
            onClick={() => logStore.setEnabled(!enabled)}
            disabled={!canStream}
            title={enabled ? 'Stop reading the device log' : 'Start reading the device log from now'}
          >
            {enabled ? 'Stop' : 'Start'}
          </ToolbarButton>
          <div className="w-px h-5 bg-border-muted mx-0.5" />
          <ToolbarButton
            onClick={loadHistory}
            disabled={!canStream || historyBusy || bufferFull}
            title={
              bufferFull
                ? 'The buffer is full; clear it or raise the limit in Settings to load earlier lines'
                : `Load up to ${HISTORY_LINES.toLocaleString()} lines the device logged before these`
            }
          >
            {historyBusy ? 'Loading…' : 'Load earlier lines'}
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              setSelectedSeq(null);
              logStore.clear();
            }}
            disabled={state.rows.length === 0}
            title="Clear the view (the device's own log is untouched)"
          >
            Clear
          </ToolbarButton>
          <ToolbarButton
            onClick={async () => setExportNotice(await exportRows(rows, mode))}
            disabled={rows.length === 0}
            title={filterActive ? 'Save the lines matching the current filters' : 'Save all lines to a text file'}
          >
            Export
          </ToolbarButton>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-start gap-2 flex-wrap">
        <div className="w-80 max-w-full">
          <div
            className={`flex items-center h-8 rounded-md border bg-surface transition-colors focus-within:border-accent ${
              filterError ? 'border-log-error/70' : 'border-border-muted'
            }`}
          >
            <span className="pl-2.5 pr-1.5 text-text-muted">
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={filter.search}
              onChange={(e) => logStore.setFilter({ search: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && filter.search) {
                  e.stopPropagation();
                  logStore.setFilter({ search: '' });
                }
              }}
              placeholder={filter.regex ? 'Regular expression' : 'Search messages and tags'}
              spellCheck={false}
              aria-invalid={!!filterError}
              className={`flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none ${
                filter.regex ? 'font-mono text-xs' : ''
              }`}
            />
            {!filter.search && <span className="kbd mr-1.5">⌘F</span>}
            <button
              onClick={() => logStore.setFilter({ regex: !filter.regex })}
              title={filter.regex ? 'Regular expression on (case-insensitive)' : 'Use a regular expression'}
              aria-pressed={filter.regex}
              className={`mr-1 h-6 px-1.5 rounded font-mono text-xs transition-colors ${
                filter.regex ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              .*
            </button>
          </div>
          {filterError && (
            <p className="mt-1 text-xs text-log-error truncate" title={filterError}>
              Invalid pattern: {filterError}. Search is ignored until it’s fixed.
            </p>
          )}
        </div>

        <div className="flex items-center h-8 p-0.5 rounded-md bg-surface border border-border-muted" role="group" aria-label="Minimum level">
          {LEVELS.map((level) => {
            const active = LEVEL_ORDER.indexOf(level.id) >= LEVEL_ORDER.indexOf(filter.minLevel);
            return (
              <button
                key={level.id}
                onClick={() => logStore.setFilter({ minLevel: level.id })}
                title={level.id === 'V' ? 'Show all levels' : `Show ${level.name.toLowerCase()} and above`}
                aria-pressed={filter.minLevel === level.id}
                className={`w-7 h-7 rounded font-mono text-xs font-semibold transition-colors ${
                  active ? `log-${level.id} hover:bg-surface-hover` : 'text-text-muted/50 hover:text-text-muted'
                } ${filter.minLevel === level.id ? 'bg-surface-hover' : ''}`}
              >
                {level.id}
              </button>
            );
          })}
        </div>

        <TagFilterPopover
          rows={state.rows}
          includeTags={filter.includeTags}
          excludeTags={filter.excludeTags}
          onChange={(patch) => logStore.setFilter(patch)}
        />

        {filterActive && (
          <button
            onClick={() => logStore.resetFilter()}
            className="h-8 px-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Stream problems keep the captured lines visible */}
      {state.rows.length > 0 && (status === 'ended' || status === 'error' || status === 'waiting-for-app') && (
        <StreamBanner state={state} packageName={packageName} deviceId={device.id} />
      )}

      {/* Log lines */}
      <div className="relative flex-1 min-h-0 flex flex-col bg-surface rounded-lg border border-border-muted overflow-hidden">
        <LogList
          rows={rows}
          selectedSeq={selectedSeq}
          onSelect={handleSelect}
          showPid={mode !== 'rn'}
          empty={emptyState}
          suppressJumpPill={paused}
        />
        {paused && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 h-9 pl-3.5 pr-1.5 rounded-full bg-surface-elevated border border-amber-400/30 shadow-lg shadow-black/40 text-sm animate-pop-in">
            <span className="text-amber-300">
              Paused
              {newWhilePaused > 0 && (
                <span className="text-text-secondary"> · {newWhilePaused.toLocaleString()} new line{newWhilePaused === 1 ? '' : 's'} captured</span>
              )}
            </span>
            <button
              onClick={() => logStore.setPaused(false)}
              className="h-7 px-3 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Resume
            </button>
          </div>
        )}
        {selectedRow && (
          <LogDetails
            row={selectedRow}
            onClose={() => setSelectedSeq(null)}
            onOnlyTag={(tag) => logStore.setFilter({ includeTags: [tag], excludeTags: filter.excludeTags.filter((t) => t !== tag) })}
            onHideTag={(tag) => {
              logStore.setFilter({
                excludeTags: filter.excludeTags.includes(tag) ? filter.excludeTags : [...filter.excludeTags, tag],
                includeTags: filter.includeTags.filter((t) => t !== tag),
              });
              setSelectedSeq(null);
            }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 text-xs text-text-muted min-h-4">
        <span className="font-mono">
          {filterActive || paused
            ? `${rows.length.toLocaleString()} of ${state.rows.length.toLocaleString()} lines`
            : `${state.rows.length.toLocaleString()} lines`}
        </span>
        <span>Keeps the newest {state.capacity.toLocaleString()} (change in Settings)</span>
        {state.dropped > 0 && (
          <span className="text-amber-300/90" title="The device logged faster than the app could display">
            {state.dropped.toLocaleString()} lines skipped during a burst
          </span>
        )}
        {isFiltering && <span>Filtering…</span>}
        {exportNotice && <span className="truncate">{exportNotice}</span>}
        {state.historyMessage && (
          <span className={state.history === 'error' ? 'text-log-error' : ''}>{state.historyMessage}</span>
        )}
      </div>
    </div>
  );
}

function findBySeq(rows: readonly LogRow[], seq: number): LogRow | null {
  const index = firstIndexAfter(rows, seq - 1);
  return index < rows.length && rows[index].seq === seq ? rows[index] : null;
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: 'default' | 'warn';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 px-3 rounded-md text-sm font-medium border transition-colors btn-press disabled:opacity-40 disabled:pointer-events-none ${
        tone === 'warn'
          ? 'bg-amber-400/10 border-amber-400/30 text-amber-300 hover:bg-amber-400/20'
          : 'bg-surface border-border-muted text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function StreamBanner({ state, packageName, deviceId }: { state: LogStoreState; packageName: string; deviceId: string }) {
  const { status, statusMessage } = state;
  const title =
    status === 'waiting-for-app'
      ? `${packageName} isn’t running`
      : status === 'ended'
        ? 'The log stream ended'
        : 'Couldn’t read the device log';
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-log-error/30 bg-log-error/10 text-sm animate-fade-in">
      <span className="text-text-primary">{title}</span>
      {statusMessage && <span className="text-text-secondary truncate">{statusMessage}</span>}
      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        {status === 'waiting-for-app' && packageName && (
          <button
            onClick={() => window.electronAPI.launchApp(deviceId, packageName).then(() => logStore.restart(false))}
            className="h-7 px-2.5 rounded-md text-sm text-text-primary bg-surface hover:bg-surface-hover border border-border-muted transition-colors"
          >
            Launch app
          </button>
        )}
        <button
          onClick={() => logStore.restart(status === 'ended')}
          className="h-7 px-2.5 rounded-md text-sm text-white bg-accent hover:bg-accent-hover transition-colors"
        >
          {status === 'ended' ? 'Reconnect' : 'Try again'}
        </button>
      </div>
    </div>
  );
}

function renderEmptyState({
  state,
  packageName,
  hiddenByFilter,
  onLoadHistory,
  historyBusy,
}: {
  state: LogStoreState;
  packageName: string;
  hiddenByFilter: boolean;
  onLoadHistory: () => void;
  historyBusy: boolean;
}): React.ReactNode {
  const { status, mode, statusMessage } = state;

  if (hiddenByFilter) {
    return (
      <EmptyState
        icon={<SearchIcon />}
        title="No lines match these filters"
        description={`${state.rows.length.toLocaleString()} captured line${state.rows.length === 1 ? ' is' : 's are'} hidden by the current search, level or tag filters.`}
        action={{ label: 'Reset filters', onClick: () => logStore.resetFilter() }}
      />
    );
  }

  switch (status) {
    case 'needs-app':
      return (
        <EmptyState
          icon={<LogsIconLarge />}
          title="Choose an app to see its logs"
          description="App mode shows everything one app logs, including native code. Pick a debuggable app in the toolbar, or switch to Device to see every line."
          action={{ label: 'Show device logs', onClick: () => logStore.setMode('device') }}
        />
      );
    case 'waiting-for-app':
      return (
        <EmptyState
          icon={<LogsIconLarge />}
          title={`${packageName || 'The app'} isn’t running`}
          description="This device is older than Android 9, so logs are matched by process. Start the app, then try again."
          action={{ label: 'Try again', onClick: () => logStore.restart(false) }}
        />
      );
    case 'stopped':
      return (
        <EmptyState
          icon={<LogsIconLarge />}
          title="Log streaming is off"
          description="Start streaming to see new lines as the device writes them. Auto-start can be turned on in Settings."
          action={{ label: 'Start streaming', onClick: () => logStore.setEnabled(true) }}
        />
      );
    case 'error':
      return (
        <EmptyState
          icon={<LogsIconLarge />}
          title="Couldn’t read the device log"
          description={statusMessage ?? 'adb logcat failed to start. Check the device connection and try again.'}
          action={{ label: 'Try again', onClick: () => logStore.restart(false) }}
        />
      );
    case 'ended':
      return (
        <EmptyState
          icon={<LogsIconLarge />}
          title="The log stream ended"
          description={statusMessage ?? 'adb logcat stopped, usually because the device disconnected or adb restarted.'}
          action={{ label: 'Reconnect', onClick: () => logStore.restart(true) }}
        />
      );
    case 'no-device':
      return (
        <EmptyState
          icon={<LogsIconLarge />}
          title="Device disconnected"
          description="Reconnect the device; streaming resumes where it left off."
        />
      );
    default: {
      const scope =
        mode === 'rn'
          ? 'React Native lines (console.log, warnings, errors)'
          : mode === 'app'
            ? `lines from ${packageName}`
            : 'lines from the whole device';
      return (
        <div className="h-full flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="w-11 h-11 mb-3 rounded-xl bg-background border border-border-muted flex items-center justify-center text-text-muted">
            <LogsIconLarge />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">
            {status === 'starting' ? 'Connecting to the device log…' : 'Waiting for new lines'}
          </p>
          <p className="text-sm text-text-secondary max-w-sm">
            New {scope} appear here as they’re written. Older lines aren’t replayed automatically.
          </p>
          <button
            onClick={onLoadHistory}
            disabled={historyBusy || status === 'starting'}
            className="mt-4 px-3.5 h-8 text-sm font-medium rounded-md border border-border bg-surface-hover text-text-primary hover:bg-border disabled:opacity-50 transition-colors btn-press"
          >
            {historyBusy ? 'Loading…' : `Load the last ${HISTORY_LINES.toLocaleString()} lines`}
          </button>
          {state.history === 'empty' && <p className="mt-2 text-xs text-text-muted">{state.historyMessage}</p>}
          {state.history === 'error' && <p className="mt-2 text-xs text-log-error">{state.historyMessage}</p>}
        </div>
      );
    }
  }
}
