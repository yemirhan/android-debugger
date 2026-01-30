import React, { useState, useMemo } from 'react';
import type { Device, HeapClass } from '@android-debugger/shared';
import { useHeapDump } from '../hooks/useHeapDump';
import { HeapIcon } from './icons';

interface HeapDumpPanelProps {
  device: Device;
  packageName: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

export function HeapDumpPanel({ device, packageName }: HeapDumpPanelProps) {
  const {
    dumps,
    selectedDump,
    analysis,
    selectedClass,
    isCapturing,
    isAnalyzing,
    error,
    captureDump,
    selectDump,
    selectClass,
    clearDumps,
    clearError,
  } = useHeapDump(device, packageName);

  const [sortBy, setSortBy] = useState<'name' | 'instanceCount' | 'shallowSize'>('shallowSize');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const sortedClasses = useMemo(() => {
    if (!analysis?.classes) return [];

    let classes = [...analysis.classes];

    // Filter by search term
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      classes = classes.filter(c => c.name.toLowerCase().includes(lower));
    }

    // Sort
    classes.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'instanceCount':
          cmp = a.instanceCount - b.instanceCount;
          break;
        case 'shallowSize':
          cmp = a.shallowSize - b.shallowSize;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return classes;
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
            <HeapIcon />
          </div>
          <p className="text-sm">Select a package to capture heap dumps</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Heap Dump Analysis</h2>
          {analysis && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {analysis.classes.length} classes • {formatBytes(analysis.totalSize)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearDumps}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          >
            Clear
          </button>
          <button
            onClick={captureDump}
            disabled={isCapturing}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 btn-press ${
              isCapturing
                ? 'bg-accent/50 text-white cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent/90'
            }`}
          >
            {isCapturing ? 'Capturing...' : 'Capture Heap Dump'}
          </button>
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
        <strong>Note:</strong> Heap dumps require the app to be debuggable (android:debuggable="true" in manifest).
      </div>

      {/* Dump list */}
      {dumps.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-1">
          {dumps.map((dump) => (
            <button
              key={dump.id}
              onClick={() => selectDump(dump)}
              className={`px-3 py-2 rounded-lg text-xs font-mono whitespace-nowrap transition-colors ${
                selectedDump?.id === dump.id
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-surface border border-border-muted hover:bg-surface-hover'
              }`}
            >
              <div className="text-text-primary">{new Date(dump.timestamp).toLocaleTimeString()}</div>
              <div className="text-text-muted">{formatBytes(dump.fileSize)}</div>
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
              <p className="text-xs text-text-muted">Total Objects</p>
              <p className="text-xl font-semibold font-mono text-emerald-400">
                {analysis.totalObjects.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg p-3 border border-blue-500/20 bg-blue-500/5">
              <p className="text-xs text-text-muted">Total Size</p>
              <p className="text-xl font-semibold font-mono text-blue-400">
                {formatBytes(analysis.totalSize)}
              </p>
            </div>
            <div className="rounded-lg p-3 border border-violet-500/20 bg-violet-500/5">
              <p className="text-xs text-text-muted">Classes</p>
              <p className="text-xl font-semibold font-mono text-violet-400">
                {analysis.classes.length.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search classes..."
              className="flex-1 px-3 py-2 text-sm bg-surface rounded-md border border-border-muted text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Class table */}
          <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden min-h-0">
            <div className="h-full overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-surface border-b border-border-muted">
                  <tr>
                    <th
                      className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('name')}
                    >
                      Class Name {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('instanceCount')}
                    >
                      Instances {sortBy === 'instanceCount' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-primary"
                      onClick={() => handleSort('shallowSize')}
                    >
                      Shallow Size {sortBy === 'shallowSize' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Retained Size
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {sortedClasses.map((heapClass) => (
                    <tr
                      key={heapClass.id}
                      className={`hover:bg-surface-hover transition-colors cursor-pointer ${
                        selectedClass?.id === heapClass.id ? 'bg-surface-hover' : ''
                      }`}
                      onClick={() => selectClass(heapClass)}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono text-text-primary truncate max-w-md" title={heapClass.name}>
                          {heapClass.name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-blue-400">
                          {heapClass.instanceCount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-emerald-400">
                          {formatBytes(heapClass.shallowSize)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-violet-400">
                          {formatBytes(heapClass.retainedSize)}
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
              <HeapIcon />
            </div>
            <p className="text-sm text-text-muted">Analyzing heap dump...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <HeapIcon />
            </div>
            <p className="text-sm">Capture a heap dump to analyze memory usage</p>
            <p className="text-xs mt-1 text-text-muted">This requires a debuggable app</p>
          </div>
        </div>
      )}
    </div>
  );
}
