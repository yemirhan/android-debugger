import React from 'react';
import type { CrashEntry, NetworkRequest } from '@android-debugger/shared';

interface ActivityItem {
  id: string;
  type: 'crash' | 'network-error' | 'warning';
  title: string;
  subtitle: string;
  timestamp: number;
}

interface RecentActivityProps {
  crashes: CrashEntry[];
  networkErrors: NetworkRequest[];
  memoryWarnings: string[];
  maxItems?: number;
  onItemClick?: (type: string, id?: string) => void;
}

export function RecentActivity({
  crashes,
  networkErrors,
  memoryWarnings,
  maxItems = 5,
  onItemClick,
}: RecentActivityProps) {
  // Combine all activity into a single sorted list
  const activities: ActivityItem[] = [
    ...crashes.map((crash): ActivityItem => ({
      id: crash.id,
      type: 'crash',
      title: crash.processName || 'App Crash',
      subtitle: crash.stackTrace?.[0] || crash.message || 'Unknown error',
      timestamp: typeof crash.timestamp === 'string' ? Date.parse(crash.timestamp) : crash.timestamp,
    })),
    ...networkErrors
      .filter((req) => req.status && req.status >= 400)
      .map((req): ActivityItem => ({
        id: req.id,
        type: 'network-error',
        title: `${req.method} ${req.status}`,
        subtitle: new URL(req.url).pathname,
        timestamp: req.timestamp,
      })),
    ...memoryWarnings.map((warning, idx): ActivityItem => ({
      id: `warning-${idx}`,
      type: 'warning',
      title: 'Memory Warning',
      subtitle: warning,
      timestamp: Date.now() - idx * 1000,
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxItems);

  const typeStyles = {
    crash: {
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    'network-error': {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      ),
    },
    warning: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (activities.length === 0) {
    return (
      <div className="bg-surface rounded-lg p-4 border border-border-muted h-full">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
          Recent Activity
        </h3>
        <div className="flex flex-col items-center justify-center h-32 text-text-muted">
          <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">All clear! No issues detected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg p-4 border border-border-muted h-full">
      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
        Recent Activity
      </h3>
      <div className="space-y-2">
        {activities.map((activity) => {
          const style = typeStyles[activity.type];
          return (
            <button
              key={activity.id}
              onClick={() => onItemClick?.(activity.type, activity.id)}
              className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
            >
              <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${style.bg} ${style.text} flex items-center justify-center`}>
                {style.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{activity.title}</p>
                <p className="text-xs text-text-muted truncate">{activity.subtitle}</p>
              </div>
              <span className="text-xs text-text-muted flex-shrink-0">
                {formatTime(activity.timestamp)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
