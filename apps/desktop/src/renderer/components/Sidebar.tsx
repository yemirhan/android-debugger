import React from 'react';
import type { TabId } from '../App';
import type { NavGroup, NavItem } from '../types/navigation';
import { useNavigationState } from '../hooks/useNavigationState';
import { SidebarGroup, SidebarItem } from './layout';
import {
  DashboardIcon,
  PerformanceIcon,
  MemoryIcon,
  CpuIcon,
  BatteryIcon,
  NetworkStatsIcon,
  DebuggingIcon,
  LogsIcon,
  CrashIcon,
  NetworkIcon,
  WebSocketIcon,
  SdkIcon,
  AppStateIcon,
  ActivityStackIcon,
  JobsIcon,
  AlarmsIcon,
  ServicesIcon,
  FileInspectorIcon,
  ToolsIcon,
  IntentIcon,
  ScreenCaptureIcon,
  DevOptionsIcon,
  AppInfoIcon,
  InstallAppIcon,
  SettingsIcon,
  MenuIcon,
} from './icons';

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

// Navigation structure with groups
const navigationGroups: NavGroup[] = [
  {
    id: 'performance',
    label: 'Performance',
    icon: <PerformanceIcon />,
    items: [
      { id: 'memory', label: 'Memory', icon: <MemoryIcon /> },
      { id: 'cpu-fps', label: 'CPU / FPS', icon: <CpuIcon /> },
      { id: 'battery', label: 'Battery', icon: <BatteryIcon /> },
      { id: 'network-stats', label: 'Network Stats', icon: <NetworkStatsIcon /> },
    ],
  },
  {
    id: 'debugging',
    label: 'Debugging',
    icon: <DebuggingIcon />,
    items: [
      { id: 'logs', label: 'Logs', icon: <LogsIcon /> },
      { id: 'crashes', label: 'Crashes', icon: <CrashIcon /> },
      { id: 'network', label: 'Network', icon: <NetworkIcon /> },
      { id: 'websocket', label: 'WebSocket', icon: <WebSocketIcon /> },
      { id: 'sdk', label: 'SDK', icon: <SdkIcon /> },
    ],
  },
  {
    id: 'app-state',
    label: 'App State',
    icon: <AppStateIcon />,
    items: [
      { id: 'activity-stack', label: 'Activity Stack', icon: <ActivityStackIcon /> },
      { id: 'jobs', label: 'Jobs', icon: <JobsIcon /> },
      { id: 'alarms', label: 'Alarms', icon: <AlarmsIcon /> },
      { id: 'services', label: 'Services', icon: <ServicesIcon /> },
      { id: 'file-inspector', label: 'File Inspector', icon: <FileInspectorIcon /> },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: <ToolsIcon />,
    items: [
      { id: 'install-app', label: 'Install App', icon: <InstallAppIcon /> },
      { id: 'intent-tester', label: 'Intent Tester', icon: <IntentIcon /> },
      { id: 'screen-capture', label: 'Screen Capture', icon: <ScreenCaptureIcon /> },
      { id: 'dev-options', label: 'Dev Options', icon: <DevOptionsIcon /> },
      { id: 'app-info', label: 'App Info', icon: <AppInfoIcon /> },
    ],
  },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const {
    sidebarExpanded,
    toggleSidebar,
    isGroupExpanded,
    toggleGroup,
  } = useNavigationState(activeTab);

  return (
    <aside
      className={`
        bg-surface border-r border-border flex flex-col transition-all duration-200 ease-out
        ${sidebarExpanded ? 'w-[200px]' : 'w-14'}
      `}
    >
      {/* Sidebar Toggle */}
      <div className={`p-2 border-b border-border-muted ${sidebarExpanded ? '' : 'flex justify-center'}`}>
        <button
          onClick={toggleSidebar}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <MenuIcon />
        </button>
      </div>

      {/* Dashboard */}
      <div className="p-2 border-b border-border-muted">
        <SidebarItem
          id="dashboard"
          label="Dashboard"
          icon={<DashboardIcon />}
          isActive={activeTab === 'dashboard'}
          isExpanded={sidebarExpanded}
          onClick={onTabChange}
        />
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto hide-scrollbar">
        <div className="space-y-1">
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
        </div>
      </nav>

      {/* Settings */}
      <div className="border-t border-border-muted p-2">
        <SidebarItem
          id="settings"
          label="Settings"
          icon={<SettingsIcon />}
          isActive={activeTab === 'settings'}
          isExpanded={sidebarExpanded}
          onClick={onTabChange}
        />
      </div>
    </aside>
  );
}
