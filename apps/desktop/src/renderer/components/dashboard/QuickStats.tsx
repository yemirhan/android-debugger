import React from 'react';
import { StatCard, StatCardGrid } from '../shared/StatCard';
import { MemoryIcon, CpuIcon, CrashIcon, NetworkIcon } from '../icons';

interface QuickStatsProps {
  memoryMB?: number;
  cpuPercent?: number;
  fps?: number;
  crashCount: number;
  networkErrorCount: number;
  onStatClick?: (stat: 'memory' | 'cpu-fps' | 'crashes' | 'network') => void;
}

export function QuickStats({
  memoryMB,
  cpuPercent,
  fps,
  crashCount,
  networkErrorCount,
  onStatClick,
}: QuickStatsProps) {
  return (
    <StatCardGrid columns={4}>
      <StatCard
        label="Memory"
        value={memoryMB !== undefined ? `${memoryMB} MB` : '--'}
        color="emerald"
        icon={<MemoryIcon />}
        onClick={() => onStatClick?.('memory')}
      />
      <StatCard
        label="CPU / FPS"
        value={cpuPercent !== undefined && fps !== undefined
          ? `${cpuPercent}% / ${fps}`
          : cpuPercent !== undefined
          ? `${cpuPercent}%`
          : fps !== undefined
          ? `-- / ${fps}`
          : '--'}
        color="blue"
        icon={<CpuIcon />}
        onClick={() => onStatClick?.('cpu-fps')}
      />
      <StatCard
        label="Crashes"
        value={crashCount.toString()}
        color={crashCount > 0 ? 'red' : 'gray'}
        icon={<CrashIcon />}
        onClick={() => onStatClick?.('crashes')}
      />
      <StatCard
        label="Network Errors"
        value={networkErrorCount.toString()}
        color={networkErrorCount > 0 ? 'amber' : 'gray'}
        icon={<NetworkIcon />}
        onClick={() => onStatClick?.('network')}
      />
    </StatCardGrid>
  );
}
