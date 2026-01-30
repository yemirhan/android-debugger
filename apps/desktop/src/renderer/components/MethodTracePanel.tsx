import React, { useState, useMemo } from 'react';
import type { Device, MethodStats } from '@android-debugger/shared';
import { useMethodTrace } from '../hooks/useMethodTrace';
import { FlameIcon } from './icons';

interface MethodTracePanelProps {
  device: Device;
  packageName: string;
}

function formatTime(microseconds: number): string {
  if (microseconds < 1000) return `${microseconds.toFixed(0)}µs`;
  if (microseconds < 1000000) return `${(microseconds / 1000).toFixed(2)}ms`;
  return `${(microseconds / 1000000).toFixed(2)}s`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

export function MethodTracePanel({ device, packageName }: MethodTracePanelProps) {
  const {
    traces,
    selectedTrace,
    analysis,
    isRecording,
    isAnalyzing,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    selectTrace,
    clearTraces,
    clearError,
  } = useMethodTrace(device, packageName);

  const [sortBy, setSortBy] = useState<'methodName' | 'inclusiveTime' | 'exclusiveTime' | 'callCount'>('exclusiveTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const sortedMethods = useMemo(() => {
    if (!analysis?.methods) return [];

    let methods = [...analysis.methods];

    // Filter by search term
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      methods = methods.filter(m =>
        m.className.toLowerCase().includes(lower) ||
        m.methodName.toLowerCase().includes(lower)
      );
    }

    // Sort
    methods.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'methodName':
          cmp = `${a.className}.${a.methodName}`.localeCompare(`${b.className}.${b.methodName}`);
          break;
        case 'inclusiveTime':
          cmp = a.inclusiveTime - b.inclusiveTime;
          break;
        case 'exclusiveTime':
          cmp = a.exclusiveTime - b.exclusiveTime;
          break;
        case 'callCount':
          cmp = a.callCount - b.callCount;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return methods;
  }, [analysis, sortBy, sortDir, searchTerm]);

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
            <FlameIcon />
          </div>
          <p className="text-sm">Select a package to record method traces</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Method Trace</h2>
          {isRecording && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-500/15 text-red-400 rounded-full animate-pulse">
              Recording: {formatDuration(recordingDuration)}
            </span>
          )}
          {analysis && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {analysis.methods.length} methods
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearTraces}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          >
            Clear
          </button>
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-md hover:bg-red-600 transition-all duration-150 btn-press"
            >
              Stop Recording
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent/90 transition-all duration-150 btn-press"
            >
              Start Recording
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-red-500/15 border border-red-500/25 text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-300">
            ✕
          </button>
        </div>
      )}

      {/* Debuggable warning */}
      <div className="px-4 py-2.5 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400">
        <strong>Note:</strong> Method tracing requires the app to be debuggable (android:debuggable="true" in manifest).
      </div>

      {/* Trace list */}
      {traces.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-1">
          {traces.map((trace) => (
            <button
              key={trace.id}
              onClick={() => selectTrace(trace)}
              className={`px-3 py-2 rounded-lg text-xs font-mono whitespace-nowrap transition-colors ${
                selectedTrace?.id === trace.id
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-surface border border-border-muted hover:bg-surface-hover'
              }`}
            >
              <div className="text-text-primary">{new Date(trace.timestamp).toLocaleTimeString()}</div>
              <div className="text-text-muted">{formatDuration(trace.duration)}</div>
            </button>
          ))}
        </div>
      )}

      {/* Analysis view */}
      {analysis ? (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg p-3 border border-emerald-500/20 bg-emerald-500/5">
              <p className="text-xs text-text-muted">Total Methods</p>
              <p className="text-xl font-semibold font-mono text-emerald-400">
                {analysis.methods.length.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg p-3 border border-blue-500/20 bg-blue-500/5">
              <p className="text-xs text-text-muted">Total Time</p>
              <p className="text-xl font-semibold font-mono text-blue-400">
                {formatTime(analysis.totalTime)}
              </p>
            </div>
            <div className="rounded-lg p-3 border border-violet-500/20 bg-violet-500/5">
              <p className="text-xs text-text-muted">Trace Duration</p>
              <p className="text-xl font-semibold font-mono text-violet-400">
                {selectedTrace ? formatDuration(selectedTrace.duration) : '-'}
              </p>
            </div>
          </div>

          {/* Flame Chart Visualization (simplified) */}
          {analysis.flameChart.children && analysis.flameChart.children.length > 0 && (
            <div className="bg-surface rounded-lg border border-border-muted p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">Top Methods by Time</h3>
              <div className="space-y-1">
                {analysis.flameChart.children.slice(0, 10).map((entry, index) => {
                  const percentage = analysis.totalTime > 0
                    ? (entry.value / analysis.totalTime) * 100
                    : 0;
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div
                          className="h-6 rounded flex items-center px-2 text-xs font-mono text-white truncate"
                          style={{
                            width: `${Math.max(percentage, 5)}%`,
                            backgroundColor: `hsl(${(index * 30) % 360}, 70%, 50%)`,
                          }}
                          title={entry.name}
                        >
                          {entry.name.split('.').pop()?.split('(')[0]}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-text-muted w-16 text-right">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search methods..."
              className="flex-1 px-3 py-2 text-sm bg-surface rounded-md border border-border-muted text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Method table */}
          <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden min-h-0">
            <div className="h-full overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-surface border-b border-border-muted">
                  <tr>
                    <th
                      className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('methodName')}
                    >
                      Method {sortBy === 'methodName' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('inclusiveTime')}
                    >
                      Inclusive {sortBy === 'inclusiveTime' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('exclusiveTime')}
                    >
                      Exclusive {sortBy === 'exclusiveTime' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('callCount')}
                    >
                      Calls {sortBy === 'callCount' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {sortedMethods.slice(0, 200).map((method, index) => (
                    <tr key={index} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono text-text-primary truncate max-w-md" title={`${method.className}.${method.methodName}`}>
                          <span className="text-text-muted">{method.className}.</span>
                          <span className="text-accent">{method.methodName}</span>
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-blue-400">
                          {formatTime(method.inclusiveTime)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-emerald-400">
                          {formatTime(method.exclusiveTime)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-violet-400">
                          {method.callCount.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : isAnalyzing ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-accent/20 flex items-center justify-center animate-pulse">
              <FlameIcon />
            </div>
            <p className="text-sm text-text-muted">Analyzing method trace...</p>
          </div>
        </div>
      ) : isRecording ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
            </div>
            <p className="text-lg font-mono text-red-400">{formatDuration(recordingDuration)}</p>
            <p className="text-sm text-text-muted mt-2">Recording method calls...</p>
            <p className="text-xs text-text-muted mt-1">Click "Stop Recording" when done</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <FlameIcon />
            </div>
            <p className="text-sm">Start recording to capture method calls</p>
            <p className="text-xs mt-1 text-text-muted">This requires a debuggable app</p>
          </div>
        </div>
      )}
    </div>
  );
}
