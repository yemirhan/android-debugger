import React, { useState } from 'react';
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
import { useBattery } from '../hooks/useBattery';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface BatteryPanelProps {
  device: Device;
}

export function BatteryPanel({ device }: BatteryPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const { data, current, isMonitoring, stopMonitoring, clearData } = useBattery(device);
  const guide = tabGuides['battery'];

  // Format data for chart
  const chartData = data.map((d, i) => ({
    time: i,
    level: d.level,
    temperature: d.temperature,
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'charging':
        return 'text-emerald-400';
      case 'full':
        return 'text-blue-400';
      case 'discharging':
        return 'text-amber-400';
      case 'not_charging':
        return 'text-red-400';
      default:
        return 'text-text-muted';
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'good':
        return 'text-emerald-400';
      case 'overheat':
      case 'over_voltage':
        return 'text-red-400';
      case 'cold':
        return 'text-blue-400';
      case 'dead':
        return 'text-red-500';
      default:
        return 'text-text-muted';
    }
  };

  const getPluggedIcon = (plugged: string) => {
    switch (plugged) {
      case 'ac':
        return (
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'usb':
        return (
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v18m-6-6l6-6 6 6" />
          </svg>
        );
      case 'wireless':
        return (
          <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getBatteryIcon = (level: number, status: string) => {
    const isCharging = status === 'charging' || status === 'full';
    let color = 'text-emerald-400';
    if (level <= 20) color = 'text-red-400';
    else if (level <= 40) color = 'text-amber-400';

    return (
      <div className={`relative ${color}`}>
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="6" width="18" height="12" rx="2" strokeWidth={1.5} />
          <rect x="20" y="9" width="2" height="6" rx="1" strokeWidth={1.5} />
          <rect x="4" y="8" width={Math.max(1, (level / 100) * 14)} height="8" rx="1" fill="currentColor" />
        </svg>
        {isCharging && (
          <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>
    );
  };

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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Battery Monitor</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
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

      {/* Current status */}
      {current && (
        <div className="flex items-center gap-6 bg-surface rounded-lg p-4 border border-border-muted">
          <div className="flex items-center gap-4">
            {getBatteryIcon(current.level, current.status)}
            <div>
              <p className="text-3xl font-bold font-mono">{current.level}%</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-sm capitalize ${getStatusColor(current.status)}`}>
                  {current.status.replace('_', ' ')}
                </span>
                {current.plugged !== 'none' && (
                  <div className="flex items-center gap-1">
                    {getPluggedIcon(current.plugged)}
                    <span className="text-xs text-text-muted uppercase">{current.plugged}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-text-muted mb-0.5">Temperature</p>
              <p className={`text-lg font-semibold font-mono ${current.temperature > 40 ? 'text-red-400' : current.temperature > 35 ? 'text-amber-400' : 'text-text-primary'}`}>
                {current.temperature.toFixed(1)}°C
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Voltage</p>
              <p className="text-lg font-semibold font-mono text-text-primary">
                {(current.voltage / 1000).toFixed(2)}V
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Health</p>
              <p className={`text-lg font-semibold capitalize ${getHealthColor(current.health)}`}>
                {current.health.replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 bg-surface rounded-lg p-4 border border-border-muted">
        {data.length > 0 ? (
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
                yAxisId="level"
                stroke="#71717a"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                width={40}
              />
              <YAxis
                yAxisId="temp"
                orientation="right"
                stroke="#71717a"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v) => `${v}°`}
                domain={['auto', 'auto']}
                width={40}
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
                formatter={(value: number, name: string) => {
                  if (name === 'level') return [`${value}%`, 'Battery'];
                  if (name === 'temperature') return [`${value}°C`, 'Temperature'];
                  return [value, name];
                }}
              />
              <Line
                yAxisId="level"
                type="monotone"
                dataKey="level"
                name="level"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temperature"
                name="temperature"
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
                <rect x="2" y="6" width="18" height="12" rx="2" strokeWidth={1.5} />
                <rect x="20" y="9" width="2" height="6" rx="1" strokeWidth={1.5} />
              </svg>
            </div>
            <p className="text-sm">Waiting for battery data...</p>
          </div>
        )}
      </div>

      {/* Stats cards */}
      {current && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Battery Level"
            value={`${current.level}%`}
            color={current.level <= 20 ? 'red' : current.level <= 40 ? 'amber' : 'emerald'}
          />
          <StatCard
            label="Temperature"
            value={`${current.temperature.toFixed(1)}°C`}
            color={current.temperature > 40 ? 'red' : current.temperature > 35 ? 'amber' : 'blue'}
          />
          <StatCard
            label="Voltage"
            value={`${(current.voltage / 1000).toFixed(2)}V`}
            color="violet"
          />
          <StatCard
            label="Health"
            value={current.health.replace('_', ' ')}
            color={current.health === 'good' ? 'emerald' : 'amber'}
          />
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
      <p className={`text-lg font-semibold font-mono capitalize ${textColors[color]}`}>{value}</p>
    </div>
  );
}
