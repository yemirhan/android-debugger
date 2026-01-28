import React from 'react';
import type { Device, ActivityInfo, TaskStack } from '@android-debugger/shared';
import { useActivityStack } from '../hooks/useActivityStack';

interface ActivityStackPanelProps {
  device: Device;
  packageName: string;
}

export function ActivityStackPanel({ device, packageName }: ActivityStackPanelProps) {
  const { data, isLoading, error, isPolling, refresh, stopPolling, startPolling } = useActivityStack(device, packageName);

  const getStateColor = (state: ActivityInfo['state']) => {
    switch (state) {
      case 'resumed':
        return 'text-emerald-400 bg-emerald-500/15';
      case 'paused':
        return 'text-amber-400 bg-amber-500/15';
      case 'stopped':
        return 'text-text-muted bg-surface-hover';
      case 'destroyed':
        return 'text-red-400 bg-red-500/15';
      default:
        return 'text-text-muted bg-surface-hover';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Activity Stack</h2>
          {data?.tasks && data.tasks.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {data.tasks.length} task{data.tasks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
      {!packageName && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400">
          Select a package to view its activity stack
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-red-500/15 border border-red-500/25 text-red-400">
          {error}
        </div>
      )}

      {/* Focused Activity */}
      {data?.focusedActivity && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-accent-muted border border-accent/25">
          <span className="text-text-muted">Focused: </span>
          <span className="text-accent font-mono">{data.focusedActivity}</span>
        </div>
      )}

      {/* Activity stack */}
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden">
        {data?.tasks && data.tasks.length > 0 ? (
          <div className="h-full overflow-auto p-4 space-y-4">
            {data.tasks.map((task: TaskStack) => (
              <div key={task.taskId} className="border border-border-muted rounded-lg overflow-hidden">
                {/* Task header */}
                <div className="px-4 py-2.5 bg-surface-hover border-b border-border-muted flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-text-primary">Task #{task.taskId}</span>
                    {task.isVisible && (
                      <span className="px-2 py-0.5 text-xs font-medium text-emerald-400 bg-emerald-500/15 rounded">
                        Visible
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-text-muted">
                    {task.activities.length} activit{task.activities.length !== 1 ? 'ies' : 'y'}
                  </span>
                </div>

                {/* Activities in task */}
                <div className="divide-y divide-border-muted">
                  {task.activities.map((activity: ActivityInfo, index: number) => (
                    <div
                      key={`${activity.name}-${index}`}
                      className={`px-4 py-3 flex items-center gap-4 ${
                        activity.isTop ? 'bg-accent-muted/30' : ''
                      }`}
                    >
                      {/* Stack position indicator */}
                      <div className="flex flex-col items-center gap-1 w-8">
                        <span className="text-xs text-text-muted">
                          {activity.isTop ? 'TOP' : `#${index}`}
                        </span>
                        {index < task.activities.length - 1 && (
                          <div className="w-px h-4 bg-border-muted" />
                        )}
                      </div>

                      {/* Activity info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate" title={activity.name}>
                          {activity.shortName}
                        </p>
                        <p className="text-xs font-mono text-text-muted truncate" title={activity.name}>
                          {activity.name}
                        </p>
                      </div>

                      {/* State badge */}
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStateColor(activity.state)}`}>
                        {activity.state}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-sm">
              {isLoading ? 'Loading activity stack...' : 'No activity stack found'}
            </p>
            {!isLoading && packageName && (
              <p className="text-xs text-text-muted mt-1">
                The app may not be running or have any visible activities
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Resumed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Paused</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span>Stopped</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span>Destroyed</span>
        </div>
      </div>
    </div>
  );
}
