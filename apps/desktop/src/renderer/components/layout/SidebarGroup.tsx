import React, { useState } from 'react';
import type { TabId } from '../../App';
import type { NavItem } from '../../types/navigation';
import { SidebarItem } from './SidebarItem';
import { ChevronRightIcon } from '../icons';

interface SidebarGroupProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  isExpanded: boolean;
  isSidebarExpanded: boolean;
  activeTab: TabId;
  onToggle: (groupId: string) => void;
  onTabChange: (tab: TabId) => void;
}

export function SidebarGroup({
  id,
  label,
  icon,
  items,
  isExpanded,
  isSidebarExpanded,
  activeTab,
  onToggle,
  onTabChange,
}: SidebarGroupProps) {
  const [isHovered, setIsHovered] = useState(false);
  const hasActiveItem = items.some((item) => item.id === activeTab);

  // Collapsed sidebar: one icon per group, items in a hover flyout.
  if (!isSidebarExpanded) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          onClick={() => setIsHovered((open) => !open)}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={isHovered}
          className={`
            relative w-full h-9 flex items-center justify-center rounded-md transition-colors duration-150
            ${hasActiveItem
              ? 'bg-surface-hover text-accent'
              : 'text-text-muted hover:bg-surface-hover/60 hover:text-text-primary'
            }
          `}
        >
          <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        </button>

        {isHovered && (
          <div className="absolute left-full top-0 z-50 min-w-[180px] pl-2" role="menu">
            <div className="bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 animate-pop-in p-1">
              <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-text-muted">{label}</div>
              {items.map((item) => (
                <button
                  key={item.id}
                  role="menuitem"
                  onClick={() => {
                    onTabChange(item.id);
                    setIsHovered(false);
                  }}
                  className={`
                    w-full flex items-center gap-2.5 h-8 px-2.5 text-left rounded-md transition-colors
                    ${activeTab === item.id
                      ? 'bg-surface-hover text-text-primary'
                      : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text-primary'
                    }
                  `}
                >
                  <span
                    className={`w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 ${
                      activeTab === item.id ? 'text-accent' : 'text-text-muted'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="text-[13px]">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => onToggle(id)}
        aria-expanded={isExpanded}
        className="group w-full flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium text-text-muted hover:text-text-secondary transition-colors"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        {!isExpanded && hasActiveItem && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
        )}
        <ChevronRightIcon
          className={`w-3 h-3 transition-all duration-150 ${
            isExpanded ? 'rotate-90 opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
        />
      </button>

      {isExpanded && (
        <div className="space-y-px sidebar-group-content">
          {items.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.id}
              label={item.label}
              icon={item.icon}
              isActive={activeTab === item.id}
              isExpanded
              isNested
              onClick={onTabChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
