import React from 'react';
import type { TimelineEvent } from '@android-debugger/shared';

interface EventDetailProps {
  event: TimelineEvent;
  onClose: () => void;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  return (
    <div className="w-96 border-l border-border bg-surface flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-text-primary">Event Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Type</label>
          <p className="text-sm text-text-primary capitalize">{event.type}</p>
        </div>

        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Timestamp</label>
          <p className="text-sm text-text-primary font-mono">{formatTimestamp(event.timestamp)}</p>
        </div>

        {event.severity && (
          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Severity</label>
            <p className={`text-sm capitalize ${
              event.severity === 'critical' ? 'text-red-400' :
              event.severity === 'error' ? 'text-red-400' :
              event.severity === 'warning' ? 'text-yellow-400' :
              'text-text-primary'
            }`}>
              {event.severity}
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Title</label>
          <p className="text-sm text-text-primary">{event.title}</p>
        </div>

        {event.subtitle && (
          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Subtitle</label>
            <p className="text-sm text-text-primary break-words">{event.subtitle}</p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wide">Data</label>
          <pre className="mt-1 p-3 bg-surface-elevated rounded-lg text-xs text-text-secondary overflow-auto max-h-96 font-mono">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
