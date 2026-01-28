import React, { useState } from 'react';
import type { Device, ScheduledJob } from '@android-debugger/shared';
import { useJobScheduler } from '../hooks/useJobScheduler';

interface JobSchedulerPanelProps {
  device: Device;
  packageName: string;
}

export function JobSchedulerPanel({ device, packageName }: JobSchedulerPanelProps) {
  const [showAllPackages, setShowAllPackages] = useState(false);
  const { data, isLoading, error, isPolling, refresh, stopPolling, startPolling } = useJobScheduler(
    device,
    showAllPackages ? undefined : packageName || undefined
  );

  const getStateColor = (state: ScheduledJob['state']) => {
    switch (state) {
      case 'active':
        return 'text-emerald-400 bg-emerald-500/15';
      case 'ready':
        return 'text-blue-400 bg-blue-500/15';
      case 'pending':
        return 'text-amber-400 bg-amber-500/15';
      case 'waiting':
        return 'text-text-muted bg-surface-hover';
      default:
        return 'text-text-muted bg-surface-hover';
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

  const getNetworkConstraintLabel = (network: ScheduledJob['constraints']['requiresNetwork']) => {
    switch (network) {
      case 'any':
        return 'Any Network';
      case 'unmetered':
        return 'Unmetered';
      case 'cellular':
        return 'Cellular';
      default:
        return 'None';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Job Scheduler</h2>
          {data?.jobs && data.jobs.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {data.jobs.length} job{data.jobs.length !== 1 ? 's' : ''}
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
          Select a package to see its scheduled jobs, or enable "Show all packages"
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-red-500/15 border border-red-500/25 text-red-400">
          {error}
        </div>
      )}

      {/* Jobs table */}
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden">
        {data?.jobs && data.jobs.length > 0 ? (
          <div className="h-full overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface border-b border-border-muted">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Job ID
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Service
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    State
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Constraints
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Timing
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Persisted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {data.jobs.map((job: ScheduledJob) => (
                  <tr key={`${job.packageName}-${job.jobId}`} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-medium text-text-primary">
                        #{job.jobId}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-text-primary truncate max-w-xs" title={job.serviceName}>
                        {job.serviceName.split('.').pop()}
                      </p>
                      <p className="text-xs font-mono text-text-muted truncate max-w-xs" title={job.packageName}>
                        {job.packageName}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStateColor(job.state)}`}>
                        {job.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {job.constraints.requiresNetwork !== 'none' && (
                          <span className="px-1.5 py-0.5 text-xs bg-blue-500/15 text-blue-400 rounded">
                            {getNetworkConstraintLabel(job.constraints.requiresNetwork)}
                          </span>
                        )}
                        {job.constraints.requiresCharging && (
                          <span className="px-1.5 py-0.5 text-xs bg-amber-500/15 text-amber-400 rounded">
                            Charging
                          </span>
                        )}
                        {job.constraints.requiresDeviceIdle && (
                          <span className="px-1.5 py-0.5 text-xs bg-violet-500/15 text-violet-400 rounded">
                            Idle
                          </span>
                        )}
                        {job.constraints.requiresBatteryNotLow && (
                          <span className="px-1.5 py-0.5 text-xs bg-emerald-500/15 text-emerald-400 rounded">
                            Batt OK
                          </span>
                        )}
                        {job.constraints.requiresStorageNotLow && (
                          <span className="px-1.5 py-0.5 text-xs bg-pink-500/15 text-pink-400 rounded">
                            Storage OK
                          </span>
                        )}
                        {job.constraints.requiresNetwork === 'none' &&
                          !job.constraints.requiresCharging &&
                          !job.constraints.requiresDeviceIdle &&
                          !job.constraints.requiresBatteryNotLow &&
                          !job.constraints.requiresStorageNotLow && (
                            <span className="text-xs text-text-muted">None</span>
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-text-secondary">
                        {job.timing.periodicInterval ? (
                          <span>Every {formatInterval(job.timing.periodicInterval)}</span>
                        ) : job.timing.minLatency ? (
                          <span>Min {formatInterval(job.timing.minLatency)}</span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {job.isPersisted ? (
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
              {isLoading ? 'Loading scheduled jobs...' : 'No scheduled jobs found'}
            </p>
            {!isLoading && (packageName || showAllPackages) && (
              <p className="text-xs text-text-muted mt-1">
                The app may not have any scheduled jobs
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Active</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Ready</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span>Waiting</span>
        </div>
      </div>
    </div>
  );
}
