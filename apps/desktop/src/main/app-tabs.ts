/**
 * Every tab the renderer can show. Shared by the renderer (TabId) and the MCP
 * server (navigate_ui), so the two can't drift apart. No imports on purpose.
 */
export const APP_TABS = [
  'dashboard',
  'memory',
  'logs',
  'cpu-fps',
  'network',
  'sdk',
  'settings',
  'app-info',
  'screen-capture',
  'dev-options',
  'file-inspector',
  'intent-tester',
  'battery',
  'crashes',
  'services',
  'network-stats',
  'activity-stack',
  'jobs',
  'alarms',
  'websocket',
  'install-app',
  'bundle-analyzer',
  'thread-monitor',
  'gc-monitor',
  'heap-dump',
  'method-trace',
  'screen-mirror',
  'rn-devtools',
] as const;

export type AppTabId = (typeof APP_TABS)[number];

/** Sections inside a tab that can be scrolled into view, e.g. Settings → AI assistants. */
export type AppSection = 'mcp';

export function isAppTab(value: unknown): value is AppTabId {
  return typeof value === 'string' && (APP_TABS as readonly string[]).includes(value);
}
