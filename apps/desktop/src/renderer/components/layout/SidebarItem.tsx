import React, { useState } from 'react';
import type { TabId } from '../../App';

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
        className={`
          relative w-full flex items-center gap-3 rounded-lg transition-all duration-150 btn-press
          ${isNested ? 'h-9' : 'h-10'}
          ${isExpanded ? 'px-3' : 'px-0 justify-center'}
          ${isActive
            ? 'bg-accent-muted text-accent'
            : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
          }
        `}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-r" />
        )}
        <span className={`flex-shrink-0 ${isNested ? 'w-4 h-4 [&>svg]:w-4 [&>svg]:h-4' : ''}`}>
          {icon}
        </span>
        {isExpanded && (
          <span className={`text-sm font-medium truncate ${isNested ? 'text-xs' : ''}`}>
            {label}
          </span>
        )}
      </button>

      {/* Tooltip when collapsed */}
      {!isExpanded && isHovered && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded-md shadow-lg animate-fade-in">
            <span className="text-xs font-medium text-text-primary whitespace-nowrap">{label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
