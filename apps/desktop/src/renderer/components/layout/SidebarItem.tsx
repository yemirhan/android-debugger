import React, { useState } from 'react';
import type { TabId } from '../../App';
import { MonitorLiveDot } from '../monitoring/MonitorLiveDot';

interface SidebarItemProps {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  isExpanded: boolean;
  isNested?: boolean;
  onClick: (id: TabId) => void;
}

export function SidebarItem({
  id,
  label,
  icon,
  isActive,
  isExpanded,
  isNested = false,
  onClick,
}: SidebarItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => onClick(id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={isExpanded ? undefined : label}
        className={`
          relative w-full flex items-center gap-2.5 rounded-md transition-colors duration-150
          ${isNested ? 'h-8' : 'h-9'}
          ${isExpanded ? 'px-2.5' : 'px-0 justify-center'}
          ${isActive
            ? 'bg-surface-hover text-text-primary'
            : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text-primary'
          }
        `}
      >
        <span
          className={`flex-shrink-0 w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 ${
            isActive ? 'text-accent' : 'text-text-muted'
          }`}
        >
          {icon}
        </span>
        {isExpanded && (
          <span className={`truncate text-[13px] ${isActive ? 'font-medium' : ''}`}>
            {label}
          </span>
        )}
        <MonitorLiveDot tabIds={[id]} variant={isExpanded ? 'inline' : 'corner'} />
      </button>

      {/* Tooltip when collapsed */}
      {!isExpanded && isHovered && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded-md shadow-lg shadow-black/40 animate-pop-in">
            <span className="text-xs font-medium text-text-primary whitespace-nowrap">{label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
