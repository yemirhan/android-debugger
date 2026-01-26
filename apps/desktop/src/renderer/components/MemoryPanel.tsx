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
        <h2 className="text-lg font-semibold">Memory Usage</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={clearData}
            className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border transition-colors"
          >
            Clear
          </button>
          <button
            onClick={isMonitoring ? stopMonitoring : undefined}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              isMonitoring
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-400'
            }`}
          >
            {isMonitoring ? 'Stop' : 'Stopped'}
          </button>
        </div>
      </div>

      {/* Alert */}
      {alert && (
        <div
          className={`px-4 py-2 rounded-lg ${
            alert.type === 'critical'
              ? 'bg-red-500/20 border border-red-500/30 text-red-400'
              : 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-400'
          }`}
        >
          {alert.message}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 bg-surface rounded-xl p-4 border border-border">
        {packageName ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis
                dataKey="time"
                stroke="#737373"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                stroke="#737373"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}MB`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #262626',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#a3a3a3' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                name="Total PSS"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="java"
                name="Java Heap"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="native"
                name="Native Heap"
                stroke="#22c55e"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="graphics"
                name="Graphics"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary">
            Enter a package name to start monitoring
          </div>
        )}
      </div>

      {/* Current stats */}
      {current && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total PSS"
            value={formatMB(current.totalPss)}
            color="violet"
          />
          <StatCard
            label="Java Heap"
            value={formatMB(current.javaHeap)}
            color="blue"
          />
          <StatCard
            label="Native Heap"
            value={formatMB(current.nativeHeap)}
            color="green"
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
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Memory Breakdown</h3>
          <div className="grid grid-cols-6 gap-4 text-sm">
            <div>
              <p className="text-text-muted">Stack</p>
              <p className="text-text-primary font-medium">{formatMB(current.stack)}</p>
            </div>
            <div>
              <p className="text-text-muted">Code</p>
              <p className="text-text-primary font-medium">{formatMB(current.code)}</p>
            </div>
            <div>
              <p className="text-text-muted">System</p>
              <p className="text-text-primary font-medium">{formatMB(current.system)}</p>
            </div>
            <div>
              <p className="text-text-muted">Other</p>
              <p className="text-text-primary font-medium">{formatMB(current.other)}</p>
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
  color: 'violet' | 'blue' | 'green' | 'amber' | 'red' | 'cyan';
}

function StatCard({ label, value, color }: StatCardProps) {
  const colors = {
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  };

  return (
    <div className={`rounded-xl p-4 border ${colors[color]}`}>
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
