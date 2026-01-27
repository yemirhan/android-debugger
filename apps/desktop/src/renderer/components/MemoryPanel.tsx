import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { Device } from '@android-debugger/shared';
import { useMemory } from '../hooks/useMemory';

interface MemoryPanelProps {
  device: Device;
  packageName: string;
}

export function MemoryPanel({ device, packageName }: MemoryPanelProps) {
  const { data, current, isMonitoring, alert, stopMonitoring, clearData } = useMemory(
    device,
    packageName
  );

  // Format data for chart
  const chartData = data.map((d, i) => ({
    time: i,
    total: Math.round(d.totalPss / 1024),
    java: Math.round(d.javaHeap / 1024),
    native: Math.round(d.nativeHeap / 1024),
    graphics: Math.round(d.graphics / 1024),
  }));

  const formatMB = (kb: number) => `${Math.round(kb / 1024)} MB`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Memory Usage</h2>
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

      {/* Alert */}
      {alert && (
        <div
          className={`px-4 py-2.5 rounded-lg text-sm font-medium animate-fade-in ${
            alert.type === 'critical'
              ? 'bg-red-500/15 border border-red-500/25 text-red-400'
              : 'bg-amber-500/15 border border-amber-500/25 text-amber-400'
          }`}
        >
          {alert.message}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 bg-surface rounded-lg p-4 border border-border-muted">
        {packageName ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="time"
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
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                }}
                labelStyle={{ color: '#a1a1aa' }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="Total PSS"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="java"
                name="Java Heap"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="native"
                name="Native Heap"
                stroke="#8b5cf6"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="graphics"
                name="Graphics"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <p className="text-sm">Enter a package name to start monitoring</p>
          </div>
        )}
      </div>

      {/* Current stats */}
      {current && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Total PSS"
            value={formatMB(current.totalPss)}
            color="emerald"
          />
          <StatCard
            label="Java Heap"
            value={formatMB(current.javaHeap)}
            color="blue"
          />
          <StatCard
            label="Native Heap"
            value={formatMB(current.nativeHeap)}
            color="violet"
          />
          <StatCard
            label="Graphics"
            value={formatMB(current.graphics)}
            color="amber"
          />
        </div>
      )}

      {/* Detailed breakdown */}
      {current && (
        <div className="bg-surface rounded-lg p-4 border border-border-muted">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Memory Breakdown</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-text-muted mb-0.5">Stack</p>
              <p className="text-sm font-medium font-mono">{formatMB(current.stack)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Code</p>
              <p className="text-sm font-medium font-mono">{formatMB(current.code)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">System</p>
              <p className="text-sm font-medium font-mono">{formatMB(current.system)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Other</p>
              <p className="text-sm font-medium font-mono">{formatMB(current.other)}</p>
            </div>
          </div>
        </div>
      )}
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
