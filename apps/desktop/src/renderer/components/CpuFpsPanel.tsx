import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Device } from '@android-debugger/shared';
import { useCpu } from '../hooks/useCpu';
import { useFps } from '../hooks/useFps';

interface CpuFpsPanelProps {
  device: Device;
  packageName: string;
}

export function CpuFpsPanel({ device, packageName }: CpuFpsPanelProps) {
  const { data: cpuData, current: currentCpu, clearData: clearCpu } = useCpu(device, packageName);
  const { data: fpsData, current: currentFps, clearData: clearFps } = useFps(device, packageName);

  // Format data for charts
  const cpuChartData = cpuData.map((d, i) => ({
    time: i,
    cpu: d.usage,
  }));

  const fpsChartData = fpsData.map((d, i) => ({
    time: i,
    fps: d.fps,
    janky: d.jankyFrames,
  }));

  const clearAll = () => {
    clearCpu();
    clearFps();
  };

  const chartTooltipStyle = {
    backgroundColor: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: '8px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">CPU & FPS Monitor</h2>
        <button
          onClick={clearAll}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
        >
          Clear
        </button>
      </div>

      {/* Current stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="CPU Usage"
          value={currentCpu ? `${currentCpu.usage.toFixed(1)}%` : '-'}
          color="red"
        />
        <StatCard
          label="Current FPS"
          value={currentFps ? `${currentFps.fps}` : '-'}
          color="cyan"
        />
        <StatCard
          label="Janky Frames"
          value={currentFps ? `${currentFps.jankyFrames}` : '-'}
          color="amber"
        />
        <StatCard
          label="90th Percentile"
          value={currentFps ? `${currentFps.percentile90.toFixed(1)}ms` : '-'}
          color="violet"
        />
      </div>

      {/* Charts */}
      <div className="flex-1 grid grid-cols-2 gap-4">
        {/* CPU Chart */}
        <div className="bg-surface rounded-lg p-4 border border-border-muted flex flex-col">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">CPU Usage</h3>
          {packageName ? (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cpuChartData}>
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
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: '#a1a1aa' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    name="CPU %"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
              <div className="w-10 h-10 mb-2 rounded-lg bg-surface-hover flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-xs">Select a package</p>
            </div>
          )}
        </div>

        {/* FPS Chart */}
        <div className="bg-surface rounded-lg p-4 border border-border-muted flex flex-col">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Frame Rate</h3>
          {packageName ? (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fpsChartData}>
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
                    domain={[0, 60]}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: '#a1a1aa' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="fps"
                    name="FPS"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
              <div className="w-10 h-10 mb-2 rounded-lg bg-surface-hover flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-xs">Select a package</p>
            </div>
          )}
        </div>
      </div>

      {/* Frame timing details */}
      {currentFps && (
        <div className="bg-surface rounded-lg p-4 border border-border-muted">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Frame Timing Analysis</h3>
          <div className="grid grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-text-muted mb-0.5">Total Frames</p>
              <p className="text-sm font-medium font-mono">{currentFps.totalFrames}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Janky Frames</p>
              <p className="text-sm font-medium font-mono text-amber-400">{currentFps.jankyFrames}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">90th %ile</p>
              <p className="text-sm font-medium font-mono">{currentFps.percentile90.toFixed(2)}ms</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">95th %ile</p>
              <p className="text-sm font-medium font-mono">{currentFps.percentile95.toFixed(2)}ms</p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">99th %ile</p>
              <p className="text-sm font-medium font-mono">{currentFps.percentile99.toFixed(2)}ms</p>
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
    violet: 'border-violet-500/20 bg-violet-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    green: 'border-green-500/20 bg-green-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    red: 'border-red-500/20 bg-red-500/5',
    cyan: 'border-cyan-500/20 bg-cyan-500/5',
  };

  const textColors = {
    violet: 'text-violet-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
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
