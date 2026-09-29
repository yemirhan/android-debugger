import React from 'react';
import type { TabId } from '../../App';
import { useTabsLive } from '../../lib/monitoring/monitors';

interface MonitorLiveDotProps {
  tabIds: readonly TabId[];
  /** `inline` sits at the end of a row; `corner` overlays an icon. */
  variant?: 'inline' | 'corner';
}

/** Small green dot shown while a background monitor feeds one of these tabs. */
export function MonitorLiveDot({ tabIds, variant = 'inline' }: MonitorLiveDotProps) {
  const live = useTabsLive(tabIds);
  if (!live) return null;
  return (
    <span
      aria-hidden
      title="Collecting in the background"
      className={
        variant === 'corner'
          ? 'absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-signal ring-2 ring-surface'
          : 'ml-auto flex-shrink-0 w-1.5 h-1.5 rounded-full bg-signal'
      }
    />
  );
}
