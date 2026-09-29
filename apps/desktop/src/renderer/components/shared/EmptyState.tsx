import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-muted py-12 px-6">
      {icon && (
        <div className="w-11 h-11 mb-3 rounded-xl bg-surface border border-border-muted flex items-center justify-center">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-text-primary mb-1">{title}</p>
      {description && (
        <p className="text-sm text-center text-text-secondary max-w-xs">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-3.5 h-8 text-sm font-medium bg-accent text-white rounded-md hover:bg-accent-hover transition-colors btn-press"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface NoDeviceStateProps {
  message?: string;
}

export function NoDeviceState({ message = 'Plug in a phone with USB debugging turned on, or start an emulator.' }: NoDeviceStateProps) {
  return (
    <EmptyState
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      }
      title="Connect an Android device"
      description={message}
    />
  );
}

interface NoPackageStateProps {
  feature?: string;
}

export function NoPackageState({ feature = 'monitoring' }: NoPackageStateProps) {
  return (
    <EmptyState
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      }
      title="Choose an app first"
      description={`Pick a debuggable app in the toolbar to start ${feature}.`}
    />
  );
}

interface NoDataStateProps {
  title?: string;
  description?: string;
}

export function NoDataState({ title = 'Nothing here yet', description = 'Data appears as soon as the device reports it.' }: NoDataStateProps) {
  return (
    <EmptyState
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      }
      title={title}
      description={description}
    />
  );
}
