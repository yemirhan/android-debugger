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

  const hasActiveItem = items.some(item => item.id === activeTab);
  const activeCount = items.filter(item => item.id === activeTab).length;

  return (
    <div className="space-y-0.5">
      {/* Group Header */}
      <div className="relative">
        <button
          onClick={() => onToggle(id)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`
            w-full flex items-center gap-3 h-10 rounded-lg transition-all duration-150 btn-press
            ${isSidebarExpanded ? 'px-3' : 'px-0 justify-center'}
            ${hasActiveItem
              ? 'text-accent'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }
          `}
        >
          <span className="flex-shrink-0">{icon}</span>
          {isSidebarExpanded && (
            <>
              <span className="text-sm font-medium flex-1 text-left truncate">{label}</span>
              <ChevronRightIcon
                className={`w-4 h-4 transition-transform duration-150 ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </>
          )}

          {/* Badge when collapsed */}
          {!isSidebarExpanded && hasActiveItem && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
          )}
        </button>

        {/* Tooltip when collapsed */}
        {!isSidebarExpanded && isHovered && (
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="px-2.5 py-1.5 bg-surface-elevated border border-border rounded-md shadow-lg animate-fade-in">
              <span className="text-xs font-medium text-text-primary whitespace-nowrap">
                {label} ({items.length})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Group Items */}
      {isExpanded && isSidebarExpanded && (
        <div className="pl-3 space-y-0.5 sidebar-group-content">
          {items.map((item) => (
            <SidebarItem
              key={item.id}
              id={item.id}
              label={item.label}
              icon={item.icon}
              isActive={activeTab === item.id}
              isExpanded={isSidebarExpanded}
              isNested
              onClick={onTabChange}
            />
          ))}
        </div>
      )}

      {/* Collapsed dropdown on hover - shows items when sidebar is collapsed */}
      {!isSidebarExpanded && isHovered && (
        <div
          className="absolute left-full ml-2 top-0 z-50 min-w-[160px]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="bg-surface-elevated border border-border rounded-lg shadow-lg animate-fade-in p-1">
            <div className="px-3 py-2 border-b border-border-muted">
              <span className="text-xs font-medium text-text-muted">{label}</span>
            </div>
            <div className="py-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-left rounded transition-colors
                    ${activeTab === item.id
                      ? 'bg-accent-muted text-accent'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }
                  `}
                >
                  <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4">{item.icon}</span>
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
