import React, { useState, useEffect } from 'react';
import type { Device, ScheduledAlarm } from '@android-debugger/shared';
import { useAlarmMonitor } from '../hooks/useAlarmMonitor';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface AlarmMonitorPanelProps {
  device: Device;
  packageName: string;
}

export function AlarmMonitorPanel({ device, packageName }: AlarmMonitorPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [showAllPackages, setShowAllPackages] = useState(false);
  const guide = tabGuides['alarms'];
  const { data, isLoading, error, isPolling, refresh, stopPolling, startPolling, getTimeUntilNextAlarm } = useAlarmMonitor(
    device,
    showAllPackages ? undefined : packageName || undefined
  );
  const [countdown, setCountdown] = useState<string | null>(null);

  // Update countdown every second
  useEffect(() => {
    const updateCountdown = () => {
      setCountdown(getTimeUntilNextAlarm());
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [getTimeUntilNextAlarm]);

  const getTypeColor = (type: ScheduledAlarm['type']) => {
    switch (type) {
      case 'RTC_WAKEUP':
        return 'text-red-400 bg-red-500/15';
      case 'RTC':
        return 'text-amber-400 bg-amber-500/15';
      case 'ELAPSED_REALTIME_WAKEUP':
        return 'text-violet-400 bg-violet-500/15';
      case 'ELAPSED_REALTIME':
        return 'text-blue-400 bg-blue-500/15';
      default:
        return 'text-text-muted bg-surface-hover';
    }
  };

  const formatTriggerTime = (timestamp: number): string => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatTimeUntil = (timestamp: number): string => {
    if (!timestamp) return '-';
    const now = Date.now();
    const diff = timestamp - now;

    if (diff <= 0) return 'Past';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatInterval = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
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
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Alarm Monitor</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
          {data?.alarms && data.alarms.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {data.alarms.length} alarm{data.alarms.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showAllPackages}
              onChange={(e) => setShowAllPackages(e.target.checked)}
              className="rounded border-border-muted text-accent focus:ring-accent bg-surface"
            />
            Show all packages
          </label>
          <button
            onClick={() => (isPolling ? stopPolling() : startPolling())}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all duration-150 btn-press ${
              isPolling
                ? 'text-amber-400 bg-amber-500/15 border-amber-500/25'
                : 'text-text-secondary bg-surface border-border-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {isPolling ? 'Stop Polling' : 'Start Polling'}
          </button>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Info message */}
      {!packageName && !showAllPackages && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400">
          Select a package to see its scheduled alarms, or enable "Show all packages"
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-red-500/15 border border-red-500/25 text-red-400">
          {error}
        </div>
      )}

      {/* Next alarm countdown */}
      {countdown && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-accent-muted border border-accent/25 flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-text-muted">Next alarm in: </span>
          <span className="text-accent font-mono font-medium">{countdown}</span>
        </div>
      )}

      {/* Alarms table */}
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden">
        {data?.alarms && data.alarms.length > 0 ? (
          <div className="h-full overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface border-b border-border-muted">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Package
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Trigger Time
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Time Until
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Repeat
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Exact
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {data.alarms.map((alarm: ScheduledAlarm) => (
                  <tr key={alarm.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getTypeColor(alarm.type)}`}>
                        {alarm.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-text-primary truncate max-w-xs" title={alarm.packageName}>
                        {alarm.packageName.split('.').pop()}
                      </p>
                      <p className="text-xs font-mono text-text-muted truncate max-w-xs" title={alarm.packageName}>
                        {alarm.packageName}
                      </p>
                      {alarm.tag && (
                        <p className="text-xs text-text-muted truncate max-w-xs mt-0.5" title={alarm.tag}>
                          Tag: {alarm.tag}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary">
                        {formatTriggerTime(alarm.triggerTime)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-mono ${
                        alarm.triggerTime > Date.now() ? 'text-emerald-400' : 'text-text-muted'
                      }`}>
                        {formatTimeUntil(alarm.triggerTime)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {alarm.isRepeating && alarm.repeatInterval ? (
                        <span className="text-sm text-text-secondary">
                          Every {formatInterval(alarm.repeatInterval)}
                        </span>
                      ) : (
                        <span className="text-sm text-text-muted">One-time</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {alarm.isExact ? (
                        <span className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                          <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center">
                          <svg className="w-3 h-3 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm">
              {isLoading ? 'Loading scheduled alarms...' : 'No scheduled alarms found'}
            </p>
            {!isLoading && (packageName || showAllPackages) && (
              <p className="text-xs text-text-muted mt-1">
                The app may not have any scheduled alarms
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span>RTC Wakeup</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>RTC</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          <span>Elapsed Wakeup</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Elapsed</span>
        </div>
      </div>
    </div>
  );
}
