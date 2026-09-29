import React from 'react';
import type { TabId } from '../App';
import { SidebarGroup, SidebarItem } from './layout';
import { dashboardItem, navigationGroups, settingsItem } from '../data/navigation';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  sidebarExpanded: boolean;
  isGroupExpanded: (groupId: string) => boolean;
  toggleGroup: (groupId: string) => void;
  onOpenCommandPalette: () => void;
}

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
  </svg>
);

export function Sidebar({
  activeTab,
  onTabChange,
  sidebarExpanded,
  isGroupExpanded,
  toggleGroup,
  onOpenCommandPalette,
}: SidebarProps) {
  return (
    <aside
      className={`
        bg-surface border-r border-border-muted flex flex-col transition-[width] duration-200 ease-out flex-shrink-0
        ${sidebarExpanded ? 'w-[216px]' : 'w-14'}
      `}
    >
      <div className="p-2 space-y-px">
        <button
          onClick={onOpenCommandPalette}
          title="Jump to a tool (⌘K)"
          aria-label="Jump to a tool"
          className={`w-full flex items-center gap-2.5 h-8 rounded-md border border-border-muted bg-background/60 text-text-muted hover:text-text-secondary hover:border-border transition-colors ${
            sidebarExpanded ? 'px-2.5' : 'justify-center'
          }`}
        >
          <SearchIcon />
          {sidebarExpanded && (
            <>
              <span className="flex-1 text-left text-[13px]">Jump to…</span>
              <span className="kbd">⌘K</span>
            </>
          )}
        </button>
        <div className="pt-1.5">
          <SidebarItem
            id={dashboardItem.id}
            label={dashboardItem.label}
            icon={dashboardItem.icon}
            isActive={activeTab === dashboardItem.id}
            isExpanded={sidebarExpanded}
            isNested
            onClick={onTabChange}
          />
        </div>
      </div>

      <nav
        aria-label="Tools"
        className={`flex-1 min-h-0 px-2 pb-2 ${sidebarExpanded ? 'overflow-y-auto space-y-3' : 'overflow-visible space-y-1'}`}
      >
        {navigationGroups.map((group) => (
          <SidebarGroup
            key={group.id}
            id={group.id}
            label={group.label}
            icon={group.icon}
            items={group.items}
            isExpanded={isGroupExpanded(group.id)}
            isSidebarExpanded={sidebarExpanded}
            activeTab={activeTab}
            onToggle={toggleGroup}
            onTabChange={onTabChange}
          />
        ))}
      </nav>

      <div className="border-t border-border-muted p-2">
        <SidebarItem
          id={settingsItem.id}
          label={settingsItem.label}
          icon={settingsItem.icon}
          isActive={activeTab === settingsItem.id}
          isExpanded={sidebarExpanded}
          isNested
          onClick={onTabChange}
        />
      </div>
    </aside>
  );
}
