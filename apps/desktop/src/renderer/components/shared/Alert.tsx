import React from 'react';

type AlertType = 'critical' | 'warning' | 'info' | 'success';

interface AlertProps {
  type: AlertType;
  message: string;
  onDismiss?: () => void;
}

const alertStyles: Record<AlertType, string> = {
  critical: 'bg-red-500/15 border-red-500/25 text-red-400',
  warning: 'bg-amber-500/15 border-amber-500/25 text-amber-400',
  info: 'bg-blue-500/15 border-blue-500/25 text-blue-400',
  success: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
};

export function Alert({ type, message, onDismiss }: AlertProps) {
  return (
    <div
      className={`px-4 py-2.5 rounded-lg text-sm font-medium animate-fade-in border flex items-center justify-between ${alertStyles[type]}`}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-3 opacity-60 hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface AlertBannerProps {
  type: AlertType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function AlertBanner({ type, title, description, action }: AlertBannerProps) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border animate-fade-in ${alertStyles[type]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{title}</p>
          {description && (
            <p className="text-sm opacity-80 mt-0.5">{description}</p>
          )}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="ml-4 px-3 py-1 text-xs font-medium rounded border border-current opacity-60 hover:opacity-100 transition-opacity"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
