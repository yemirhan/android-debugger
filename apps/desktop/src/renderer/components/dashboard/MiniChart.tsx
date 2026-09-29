import React, { useId } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineProps {
  data: number[];
  color: string;
  maxPoints?: number;
  /** Fixed lower bound so a flat line doesn't get stretched into noise. */
  floor?: number;
}

export function Sparkline({ data, color, maxPoints = 40, floor = 0 }: SparklineProps) {
  const gradientId = useId();
  const chartData = data.slice(-maxPoints).map((value, index) => ({ index, value }));

  if (chartData.length < 2) {
    return (
      <div className="h-full flex items-end">
        <div className="w-full border-t border-dashed border-border" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[floor, 'auto']} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
