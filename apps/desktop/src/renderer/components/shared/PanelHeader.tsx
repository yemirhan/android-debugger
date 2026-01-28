import React from 'react';

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PanelHeader({ title, subtitle, children }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

interface PanelHeaderButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'success';
  children: React.ReactNode;
}

export function PanelHeaderButton({
  onClick,
  disabled = false,
  variant = 'default',
  children,
}: PanelHeaderButtonProps) {
  const variantStyles = {
    default: 'text-text-secondary bg-surface border border-border-muted hover:bg-surface-hover hover:text-text-primary',
    danger: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
    success: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 btn-press ${variantStyles[variant]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {children}
    </button>
  );
}

interface PanelHeaderToggleProps {
  isActive: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  onToggle: () => void;
}

export function PanelHeaderToggle({
  isActive,
  activeLabel = 'Stop',
  inactiveLabel = 'Stopped',
  onToggle,
}: PanelHeaderToggleProps) {
  return (
    <button
      onClick={isActive ? onToggle : undefined}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 btn-press ${
        isActive
          ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
          : 'bg-surface text-text-muted border border-border-muted'
      }`}
    >
      {isActive ? activeLabel : inactiveLabel}
    </button>
  );
}
