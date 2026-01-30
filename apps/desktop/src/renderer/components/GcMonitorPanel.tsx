import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import type { Device, GcEvent, GcReason } from '@android-debugger/shared';
import { useGcMonitor } from '../hooks/useGcMonitor';
import { GcIcon } from './icons';

interface GcMonitorPanelProps {
  device: Device;
  packageName: string;
}

const reasonColors: Record<GcReason, string> = {
  ALLOC: '#f59e0b',
  CONCURRENT: '#10b981',
  EXPLICIT: '#8b5cf6',
  FOR_ALLOC: '#ef4444',
  BACKGROUND: '#6b7280',
  UNKNOWN: '#71717a',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function GcMonitorPanel({ device, packageName }: GcMonitorPanelProps) {
  const { events, stats, isMonitoring, stopMonitoring, clearData } = useGcMonitor(device, packageName);
  const [selectedEvent, setSelectedEvent] = useState<GcEvent | null>(null);

  // Prepare chart data
  const chartData = useMemo(() => {
    return events.map((event, index) => ({
      index,
      timestamp: event.timestamp,
      pauseTime: event.pauseTimeMs,
      heapUsed: event.heapUsed / (1024 * 1024), // MB
      heapTotal: event.heapTotal / (1024 * 1024), // MB
      freed: event.freedBytes / 1024, // KB
      reason: event.reason,
    }));
  }, [events]);

  // Group events by reason for scatter chart
  const scatterData = useMemo(() => {
    const now = Date.now();
    return events.map(event => ({
      x: (event.timestamp - (events[0]?.timestamp || now)) / 1000, // seconds since start
      y: event.pauseTimeMs,
      z: event.freedBytes / 1024, // size for marker
      reason: event.reason,
      event,
    }));
  }, [events]);

  if (!packageName) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
            <GcIcon />
          </div>
          <p className="text-sm">Select a package to monitor GC events</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">GC Monitor</h2>
          {events.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {events.length} events
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total GC Count"
          value={stats.totalGcCount.toString()}
          color="blue"
        />
        <StatCard
          label="Total Pause Time"
          value={formatTime(stats.totalPauseTime)}
          color="amber"
        />
        <StatCard
          label="Avg Pause Time"
          value={formatTime(stats.avgPauseTime)}
          color="emerald"
        />
        <StatCard
          label="Allocation Rate"
          value={`${formatBytes(stats.allocationRate)}/s`}
          color="violet"
        />
      </div>

      {/* Charts */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* Heap usage over time */}
        <div className="bg-surface rounded-lg p-4 border border-border-muted flex flex-col">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Heap Usage</h3>
          <div className="flex-1 min-h-0">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="index"
                    stroke="#71717a"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  />
                  <YAxis
                    stroke="#71717a"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(v) => `${v}MB`}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'heapUsed') return [`${value.toFixed(1)}MB`, 'Used'];
                      if (name === 'heapTotal') return [`${value.toFixed(1)}MB`, 'Total'];
                      return [value, name];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="heapTotal"
                    stroke="#6b7280"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="heapUsed"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Waiting for GC events...
              </div>
            )}
          </div>
        </div>

        {/* Pause time scatter */}
        <div className="bg-surface rounded-lg p-4 border border-border-muted flex flex-col">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Pause Times</h3>
          <div className="flex-1 min-h-0">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="index"
                    stroke="#71717a"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  />
                  <YAxis
                    stroke="#71717a"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(v) => `${v}ms`}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)}ms`, 'Pause']}
                  />
                  <Line
                    type="monotone"
                    dataKey="pauseTime"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#f59e0b' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Waiting for GC events...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent events table */}
      <div className="h-48 bg-surface rounded-lg border border-border-muted overflow-hidden">
        <div className="h-full overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-surface border-b border-border-muted">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                  Time
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                  Reason
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                  Freed
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                  Heap
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                  Pause
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {events.slice(-20).reverse().map((event) => (
                <tr
                  key={event.id}
                  className={`hover:bg-surface-hover transition-colors cursor-pointer ${
                    selectedEvent?.id === event.id ? 'bg-surface-hover' : ''
                  }`}
                  onClick={() => setSelectedEvent(event)}
                >
                  <td className="px-4 py-2 text-xs font-mono text-text-secondary">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="px-2 py-0.5 text-xs font-medium rounded"
                      style={{
                        backgroundColor: `${reasonColors[event.reason]}20`,
                        color: reasonColors[event.reason],
                      }}
                    >
                      {event.reason}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-emerald-400">
                    {formatBytes(event.freedBytes)}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-text-secondary">
                    {formatBytes(event.heapUsed)} / {formatBytes(event.heapTotal)}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-amber-400">
                    {formatTime(event.pauseTimeMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 && (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              {isMonitoring ? 'Waiting for GC events...' : 'Start monitoring to capture GC events'}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        {Object.entries(reasonColors).map(([reason, color]) => (
          <div key={reason} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  color: 'emerald' | 'blue' | 'violet' | 'amber' | 'red' | 'cyan';
}

function StatCard({ label, value, color }: StatCardProps) {
  const colors = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    violet: 'border-violet-500/20 bg-violet-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    red: 'border-red-500/20 bg-red-500/5',
    cyan: 'border-cyan-500/20 bg-cyan-500/5',
  };

  const textColors = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    cyan: 'text-cyan-400',
  };

  return (
    <div className={`rounded-lg p-3 border ${colors[color]}`}>
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-lg font-semibold font-mono ${textColors[color]}`}>{value}</p>
    </div>
  );
}
