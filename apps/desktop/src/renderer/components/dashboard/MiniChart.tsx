import React from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
} from 'recharts';

interface MiniChartProps {
  data: number[];
  color: string;
  label: string;
  value: string;
  maxPoints?: number;
}

export function MiniChart({ data, color, label, value, maxPoints = 20 }: MiniChartProps) {
  // Ensure we have data to show
  const chartData = data.slice(-maxPoints).map((value, index) => ({
    index,
    value,
  }));

  // Pad with zeros if we don't have enough data
  while (chartData.length < maxPoints) {
    chartData.unshift({ index: chartData.length, value: 0 });
  }

  return (
    <div className="bg-surface rounded-lg p-3 border border-border-muted">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-sm font-semibold font-mono" style={{ color }}>{value}</span>
      </div>
      <div className="h-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#gradient-${label})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface MiniChartPlaceholderProps {
  label: string;
  message?: string;
}

export function MiniChartPlaceholder({ label, message = 'No data' }: MiniChartPlaceholderProps) {
  return (
    <div className="bg-surface rounded-lg p-3 border border-border-muted">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-sm font-semibold font-mono text-text-muted">--</span>
      </div>
      <div className="h-12 flex items-center justify-center">
        <span className="text-xs text-text-muted">{message}</span>
      </div>
    </div>
  );
}
