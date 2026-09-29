import React from 'react';

export type StatCardColor = 'emerald' | 'blue' | 'violet' | 'amber' | 'red' | 'cyan' | 'gray';

interface StatCardProps {
  label: string;
  value: string | number;
  color?: StatCardColor;
  icon?: React.ReactNode;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
  className?: string;
}

const colorStyles: Record<StatCardColor, { bg: string; text: string; border: string }> = {
  emerald: {
    bg: 'bg-surface',
    text: 'text-emerald-400',
    border: 'border-border-muted',
  },
  blue: {
    bg: 'bg-surface',
    text: 'text-blue-400',
    border: 'border-border-muted',
  },
  violet: {
    bg: 'bg-surface',
    text: 'text-violet-400',
    border: 'border-border-muted',
  },
  amber: {
    bg: 'bg-surface',
    text: 'text-amber-400',
    border: 'border-border-muted',
  },
  red: {
    bg: 'bg-surface',
    text: 'text-red-400',
    border: 'border-border-muted',
  },
  cyan: {
    bg: 'bg-surface',
    text: 'text-cyan-400',
    border: 'border-border-muted',
  },
  gray: {
    bg: 'bg-surface',
    text: 'text-zinc-400',
    border: 'border-border-muted',
  },
};

export function StatCard({
  label,
  value,
  color = 'emerald',
  icon,
  subtitle,
  trend,
  onClick,
  className = '',
}: StatCardProps) {
  const styles = colorStyles[color];
  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`
        rounded-lg p-3 border ${styles.border} ${styles.bg}
        ${isClickable ? 'cursor-pointer hover:border-border transition-colors' : ''}
        ${className}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-text-muted mb-1">{label}</p>
          <p className={`text-lg font-semibold font-mono ${styles.text}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={`${styles.text} opacity-60`}>
            {icon}
          </div>
        )}
        {trend && (
          <div className={`text-xs ${trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-emerald-400' : 'text-text-muted'}`}>
            {trend === 'up' && '↑'}
            {trend === 'down' && '↓'}
            {trend === 'neutral' && '−'}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5;
}

export function StatCardGrid({ children, columns = 4 }: StatCardGridProps) {
  const colsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
  }[columns];

  return (
    <div className={`grid ${colsClass} gap-3`}>
      {children}
    </div>
  );
}
