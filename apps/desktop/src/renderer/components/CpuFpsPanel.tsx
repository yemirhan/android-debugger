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

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">CPU & FPS Monitor</h2>
        <button
          onClick={clearAll}
          className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Current stats */}
      <div className="grid grid-cols-4 gap-4">
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
        <div className="bg-surface rounded-xl p-4 border border-border flex flex-col">
          <h3 className="text-sm font-medium text-text-secondary mb-4">CPU Usage Over Time</h3>
          {packageName ? (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cpuChartData}>
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
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
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
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    name="CPU %"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-secondary">
              Enter a package name to start monitoring
            </div>
          )}
        </div>

        {/* FPS Chart */}
        <div className="bg-surface rounded-xl p-4 border border-border flex flex-col">
          <h3 className="text-sm font-medium text-text-secondary mb-4">FPS Over Time</h3>
          {packageName ? (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fpsChartData}>
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
                    domain={[0, 60]}
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
                  <Line
                    type="monotone"
                    dataKey="fps"
                    name="FPS"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-secondary">
              Enter a package name to start monitoring
            </div>
          )}
        </div>
      </div>

      {/* Frame timing details */}
      {currentFps && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Frame Timing Analysis</h3>
          <div className="grid grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-text-muted">Total Frames</p>
              <p className="text-text-primary font-medium">{currentFps.totalFrames}</p>
            </div>
            <div>
              <p className="text-text-muted">Janky Frames</p>
              <p className="text-amber-400 font-medium">{currentFps.jankyFrames}</p>
            </div>
            <div>
              <p className="text-text-muted">90th Percentile</p>
              <p className="text-text-primary font-medium">{currentFps.percentile90.toFixed(2)}ms</p>
            </div>
            <div>
              <p className="text-text-muted">95th Percentile</p>
              <p className="text-text-primary font-medium">{currentFps.percentile95.toFixed(2)}ms</p>
            </div>
            <div>
              <p className="text-text-muted">99th Percentile</p>
              <p className="text-text-primary font-medium">{currentFps.percentile99.toFixed(2)}ms</p>
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
