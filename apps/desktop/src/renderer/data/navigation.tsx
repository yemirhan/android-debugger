import React from 'react';
import type { TabId } from '../App';
import type { NavGroup, NavItem } from '../types/navigation';
import {
  DashboardIcon,
  PerformanceIcon,
  MemoryIcon,
  CpuIcon,
  BatteryIcon,
  NetworkStatsIcon,
  ThreadsIcon,
  GcIcon,
  HeapIcon,
  FlameIcon,
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
  BundleAnalyzerIcon,
  ScreenMirrorIcon,
  SettingsIcon,
  EmulatorIcon,
} from '../components/icons';
import { ReactNativeIcon } from '../components/rn-devtools/icons';

export const dashboardItem: NavItem = { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> };
export const settingsItem: NavItem = { id: 'settings', label: 'Settings', icon: <SettingsIcon /> };

export const navigationGroups: NavGroup[] = [
  {
    id: 'performance',
    label: 'Performance',
    icon: <PerformanceIcon />,
    items: [
      { id: 'memory', label: 'Memory', icon: <MemoryIcon />, needsPackage: true },
      { id: 'cpu-fps', label: 'CPU / FPS', icon: <CpuIcon />, needsPackage: true },
      { id: 'battery', label: 'Battery', icon: <BatteryIcon /> },
      { id: 'network-stats', label: 'Network Stats', icon: <NetworkStatsIcon />, needsPackage: true },
      { id: 'thread-monitor', label: 'Threads', icon: <ThreadsIcon />, needsPackage: true },
      { id: 'gc-monitor', label: 'GC Monitor', icon: <GcIcon />, needsPackage: true },
      { id: 'heap-dump', label: 'Heap Dump', icon: <HeapIcon />, needsPackage: true },
      { id: 'method-trace', label: 'Method Trace', icon: <FlameIcon />, needsPackage: true },
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
      { id: 'rn-devtools', label: 'React Native DevTools', icon: <ReactNativeIcon /> },
    ],
  },
  {
    id: 'app-state',
    label: 'App State',
    icon: <AppStateIcon />,
    items: [
      { id: 'activity-stack', label: 'Activity Stack', icon: <ActivityStackIcon />, needsPackage: true },
      { id: 'jobs', label: 'Jobs', icon: <JobsIcon /> },
      { id: 'alarms', label: 'Alarms', icon: <AlarmsIcon /> },
      { id: 'services', label: 'Services', icon: <ServicesIcon /> },
      { id: 'file-inspector', label: 'File Inspector', icon: <FileInspectorIcon />, needsPackage: true },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: <ToolsIcon />,
    items: [
      { id: 'emulators', label: 'Emulators', icon: <EmulatorIcon /> },
      { id: 'install-app', label: 'Install App', icon: <InstallAppIcon /> },
      { id: 'bundle-analyzer', label: 'Bundle Analyzer', icon: <BundleAnalyzerIcon /> },
      { id: 'screen-mirror', label: 'Screen Mirror', icon: <ScreenMirrorIcon /> },
      { id: 'intent-tester', label: 'Intent Tester', icon: <IntentIcon /> },
      { id: 'screen-capture', label: 'Screen Capture', icon: <ScreenCaptureIcon /> },
      { id: 'dev-options', label: 'Dev Options', icon: <DevOptionsIcon /> },
      { id: 'app-info', label: 'App Info', icon: <AppInfoIcon />, needsPackage: true },
    ],
  },
];

/** Every navigable destination, in sidebar order. */
export const allNavItems: NavItem[] = [
  dashboardItem,
  ...navigationGroups.flatMap((group) => group.items),
  settingsItem,
];

export const tabToGroup: Partial<Record<TabId, string>> = Object.fromEntries(
  navigationGroups.flatMap((group) => group.items.map((item) => [item.id, group.id]))
);

export function getNavItem(tab: TabId): NavItem | undefined {
  return allNavItems.find((item) => item.id === tab);
}
