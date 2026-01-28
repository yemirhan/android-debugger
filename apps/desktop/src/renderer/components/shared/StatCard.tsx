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
    bg: 'bg-emerald-500/5',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  blue: {
    bg: 'bg-blue-500/5',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
  violet: {
    bg: 'bg-violet-500/5',
    text: 'text-violet-400',
    border: 'border-violet-500/20',
  },
  amber: {
    bg: 'bg-amber-500/5',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  red: {
    bg: 'bg-red-500/5',
    text: 'text-red-400',
    border: 'border-red-500/20',
  },
  cyan: {
    bg: 'bg-cyan-500/5',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
  gray: {
    bg: 'bg-zinc-500/5',
    text: 'text-zinc-400',
    border: 'border-zinc-500/20',
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
        ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
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
