import React from 'react';
import type { Device } from '@android-debugger/shared';

interface QuickActionsProps {
  device: Device | null;
  onTakeScreenshot: () => void;
  onClearLogs: () => void;
  onRefreshDevice: () => void;
}

export function QuickActions({
  device,
  onTakeScreenshot,
  onClearLogs,
  onRefreshDevice,
}: QuickActionsProps) {
  const actions = [
    {
      label: 'Take Screenshot',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      onClick: onTakeScreenshot,
      disabled: !device,
    },
    {
      label: 'Clear Logs',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      onClick: onClearLogs,
      disabled: false,
    },
    {
      label: 'Refresh Device',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      onClick: onRefreshDevice,
      disabled: false,
    },
  ];

  return (
    <div className="bg-surface rounded-lg p-4 border border-border-muted h-full">
      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
        Quick Actions
      </h3>
      <div className="space-y-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`
              w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-150 btn-press
              ${action.disabled
                ? 'bg-surface-hover text-text-muted cursor-not-allowed opacity-50'
                : 'bg-surface-hover text-text-secondary hover:text-text-primary hover:bg-zinc-700/50'
              }
            `}
          >
            {action.icon}
            <span className="text-sm font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
