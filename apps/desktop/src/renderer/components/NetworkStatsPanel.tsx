import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { Device } from '@android-debugger/shared';
import { useNetworkStats } from '../hooks/useNetworkStats';
import { MonitorLiveBadge, MonitorToggle } from './monitoring/MonitorToggle';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface NetworkStatsPanelProps {
  device: Device;
  packageName: string;
}

export function NetworkStatsPanel({ device, packageName }: NetworkStatsPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const { current: rawCurrent, isMonitoring, startMonitoring, stopMonitoring, clearData, fetchStats } = useNetworkStats(
    device,
    packageName
  );
  const guide = tabGuides['network-stats'];

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Ignore stats that belong to a previously selected package.
  const current = rawCurrent && packageName && rawCurrent.packageName === packageName ? rawCurrent : null;

  // Prepare chart data
  const chartData = current
    ? [
        {
          name: 'Received',
          WiFi: current.wifi.rxBytes,
          Mobile: current.mobile.rxBytes,
        },
        {
          name: 'Transmitted',
          WiFi: current.wifi.txBytes,
          Mobile: current.mobile.txBytes,
        },
      ]
    : [];

  const totalWifi = current ? current.wifi.rxBytes + current.wifi.txBytes : 0;
  const totalMobile = current ? current.mobile.rxBytes + current.mobile.txBytes : 0;
  const totalData = totalWifi + totalMobile;

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
          <h2 className="text-base font-semibold">Network Stats</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
          <MonitorLiveBadge live={isMonitoring} what="network usage" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStats}
            disabled={!packageName}
            className="h-8 px-3 text-sm text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-colors btn-press disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={clearData}
            className="h-8 px-3 text-sm text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-colors btn-press"
          >
            Clear
          </button>
          <MonitorToggle
            isMonitoring={isMonitoring}
            onStart={startMonitoring}
            onStop={stopMonitoring}
            disabled={!packageName}
            what="network usage"
          />
        </div>
      </div>

      {/* Info message */}
      {!packageName && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400">
          Choose an app in the toolbar to see its network statistics
        </div>
      )}

      {/* Overview cards */}
      {current && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-text-muted">Total Data</p>
                <p className="text-lg font-semibold font-mono text-text-primary">{formatBytes(totalData)}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-text-muted">WiFi Total</p>
                <p className="text-lg font-semibold font-mono text-blue-400">{formatBytes(totalWifi)}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-text-muted">Mobile Total</p>
                <p className="text-lg font-semibold font-mono text-emerald-400">{formatBytes(totalMobile)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 bg-surface rounded-lg p-4 border border-border-muted">
        {packageName && current ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262a31" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#757c89"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
              />
              <YAxis
                stroke="#757c89"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v) => formatBytes(v)}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#20242a',
                  border: '1px solid #333842',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                }}
                labelStyle={{ color: '#a4abb7' }}
                formatter={(value: number) => [formatBytes(value), '']}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}
              />
              <Bar dataKey="WiFi" fill="#6ea0ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Mobile" fill="#3ddc84" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-sm">
              {packageName ? 'Loading network stats...' : 'Choose an app in the toolbar to see network stats'}
            </p>
          </div>
        )}
      </div>

      {/* Detailed breakdown */}
      {current && (
        <div className="grid grid-cols-2 gap-4">
          {/* WiFi breakdown */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
              <h3 className="text-sm font-medium text-text-primary">WiFi</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted mb-0.5">Received</p>
                <p className="text-sm font-mono text-text-primary">{formatBytes(current.wifi.rxBytes)}</p>
                <p className="text-xs text-text-muted font-mono">{current.wifi.rxPackets.toLocaleString()} pkts</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-0.5">Transmitted</p>
                <p className="text-sm font-mono text-text-primary">{formatBytes(current.wifi.txBytes)}</p>
                <p className="text-xs text-text-muted font-mono">{current.wifi.txPackets.toLocaleString()} pkts</p>
              </div>
            </div>
          </div>

          {/* Mobile breakdown */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-medium text-text-primary">Mobile</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted mb-0.5">Received</p>
                <p className="text-sm font-mono text-text-primary">{formatBytes(current.mobile.rxBytes)}</p>
                <p className="text-xs text-text-muted font-mono">{current.mobile.rxPackets.toLocaleString()} pkts</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-0.5">Transmitted</p>
                <p className="text-sm font-mono text-text-primary">{formatBytes(current.mobile.txBytes)}</p>
                <p className="text-xs text-text-muted font-mono">{current.mobile.txPackets.toLocaleString()} pkts</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
