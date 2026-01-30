import React, { useState, useMemo } from 'react';
import type { Device, ThreadInfo, ThreadState } from '@android-debugger/shared';
import { useThreadMonitor } from '../hooks/useThreadMonitor';
import { InfoIcon, ThreadsIcon } from './icons';

interface ThreadMonitorPanelProps {
  device: Device;
  packageName: string;
}

const stateColors: Record<ThreadState, { text: string; bg: string }> = {
  running: { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  sleeping: { text: 'text-amber-400', bg: 'bg-amber-500/15' },
  waiting: { text: 'text-blue-400', bg: 'bg-blue-500/15' },
  blocked: { text: 'text-red-400', bg: 'bg-red-500/15' },
  zombie: { text: 'text-violet-400', bg: 'bg-violet-500/15' },
  stopped: { text: 'text-text-muted', bg: 'bg-surface-hover' },
  unknown: { text: 'text-text-muted', bg: 'bg-surface-hover' },
};

export function ThreadMonitorPanel({ device, packageName }: ThreadMonitorPanelProps) {
  const { current, isMonitoring, stopMonitoring, clearData } = useThreadMonitor(device, packageName);
  const [sortBy, setSortBy] = useState<'name' | 'state' | 'cpuTime'>('cpuTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterState, setFilterState] = useState<ThreadState | 'all'>('all');

  const sortedThreads = useMemo(() => {
    if (!current?.threads) return [];

    let threads = [...current.threads];

    // Filter by state
    if (filterState !== 'all') {
      threads = threads.filter(t => t.state === filterState);
    }

    // Sort
    threads.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'state':
          cmp = a.state.localeCompare(b.state);
          break;
        case 'cpuTime':
          cmp = a.cpuTime - b.cpuTime;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return threads;
  }, [current, sortBy, sortDir, filterState]);

  const stateCounts = useMemo(() => {
    if (!current?.threads) return {};

    const counts: Partial<Record<ThreadState, number>> = {};
    for (const thread of current.threads) {
      counts[thread.state] = (counts[thread.state] || 0) + 1;
    }
    return counts;
  }, [current]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  if (!packageName) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
            <ThreadsIcon />
          </div>
          <p className="text-sm">Select a package to monitor threads</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Thread Monitor</h2>
          {current && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {current.threads.length} threads
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value as ThreadState | 'all')}
            className="px-3 py-1.5 text-xs font-medium bg-surface rounded-md border border-border-muted text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All States</option>
            <option value="running">Running</option>
            <option value="sleeping">Sleeping</option>
            <option value="waiting">Waiting</option>
            <option value="blocked">Blocked</option>
          </select>
          <button
            onClick={clearData}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          >
            Clear
          </button>
          <button
            onClick={isMonitoring ? stopMonitoring : undefined}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 btn-press ${
              isMonitoring
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-surface text-text-muted border border-border-muted'
            }`}
          >
            {isMonitoring ? 'Stop' : 'Stopped'}
          </button>
        </div>
      </div>

      {/* State Summary */}
      <div className="grid grid-cols-5 gap-3">
        {(['running', 'sleeping', 'waiting', 'blocked', 'stopped'] as ThreadState[]).map((state) => (
          <div
            key={state}
            className={`rounded-lg p-3 border cursor-pointer transition-colors ${
              filterState === state
                ? `${stateColors[state].bg} border-current ${stateColors[state].text}`
                : 'border-border-muted bg-surface hover:bg-surface-hover'
            }`}
            onClick={() => setFilterState(filterState === state ? 'all' : state)}
          >
            <p className="text-xs text-text-muted capitalize">{state}</p>
            <p className={`text-xl font-semibold font-mono ${stateColors[state].text}`}>
              {stateCounts[state] || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Threads table */}
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden">
        {sortedThreads.length > 0 ? (
          <div className="h-full overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface border-b border-border-muted">
                <tr>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => handleSort('name')}
                  >
                    Thread Name {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => handleSort('state')}
                  >
                    State {sortBy === 'state' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    TID
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                    onClick={() => handleSort('cpuTime')}
                  >
                    CPU Time {sortBy === 'cpuTime' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Priority
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {sortedThreads.map((thread) => (
                  <tr key={thread.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-text-primary truncate max-w-xs" title={thread.name}>
                        {thread.name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${stateColors[thread.state].bg} ${stateColors[thread.state].text}`}>
                        {thread.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-text-secondary">
                        {thread.id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-text-secondary">
                        {thread.cpuTime.toFixed(2)}s
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-text-secondary">
                        {thread.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <ThreadsIcon />
            </div>
            <p className="text-sm">
              {isMonitoring ? 'Waiting for thread data...' : 'Start monitoring to see threads'}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Running</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Sleeping</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Waiting</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span>Blocked</span>
        </div>
      </div>
    </div>
  );
}
