import React from 'react';
import type { CrashEntry, NetworkRequest } from '@android-debugger/shared';

interface ActivityItem {
  id: string;
  type: 'crash' | 'network-error';
  title: string;
  subtitle: string;
  timestamp: number;
}

interface RecentActivityProps {
  crashes: CrashEntry[];
  failedRequests: NetworkRequest[];
  maxItems?: number;
  onItemClick?: (type: ActivityItem['type']) => void;
}

function toTimestamp(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Shows the path of a request URL, falling back to the raw string for relative or malformed URLs. */
function requestPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

const CrashGlyph = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const NetworkGlyph = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
  </svg>
);

export function RecentActivity({ crashes, failedRequests, maxItems = 6, onItemClick }: RecentActivityProps) {
  const activities: ActivityItem[] = [
    ...crashes.map((crash): ActivityItem => ({
      id: `crash-${crash.id}`,
      type: 'crash',
      title: crash.message || 'App crashed',
      subtitle: crash.processName || crash.stackTrace?.[0] || 'Unknown process',
      timestamp: toTimestamp(crash.timestamp),
    })),
    ...failedRequests.map((req): ActivityItem => ({
      id: `request-${req.id}`,
      type: 'network-error',
      title: `${req.method} ${requestPath(req.url)}`,
      subtitle: `HTTP ${req.status}`,
      timestamp: toTimestamp(req.timestamp),
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxItems);

  if (activities.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-6">
        <p className="text-sm text-text-secondary">Nothing has gone wrong yet</p>
        <p className="text-xs text-text-muted mt-1 max-w-xs">
          Crashes on this device and failed requests from the SDK show up here as they happen.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-muted">
      {activities.map((activity) => (
        <li key={activity.id}>
          <button
            onClick={() => onItemClick?.(activity.type)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover/60 transition-colors text-left"
          >
            <span
              className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
                activity.type === 'crash' ? 'bg-red-500/12 text-red-400' : 'bg-amber-500/12 text-amber-400'
              }`}
            >
              {activity.type === 'crash' ? <CrashGlyph /> : <NetworkGlyph />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-text-primary truncate">{activity.title}</span>
              <span className="block text-xs text-text-muted truncate">{activity.subtitle}</span>
            </span>
            {activity.timestamp > 0 && (
              <span className="text-xs text-text-muted flex-shrink-0 tabular-nums">
                {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
