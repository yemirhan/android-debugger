/**
 * MCP server state shared by the main process, preload and renderer
 * (Settings → AI assistants). No imports so the web build can include it.
 */

export type McpServerState = 'stopped' | 'starting' | 'running' | 'error';

/** How to launch the stdio bridge; used to build copy-paste setup commands. */
export interface McpSetupInfo {
  /** The app's own executable; runs the bridge with ELECTRON_RUN_AS_NODE=1. */
  runtimePath: string;
  bridgePath: string;
  configPath: string;
  /** False when the bridge would not find the config on its own (dev builds, custom profiles). */
  configIsDefault: boolean;
  bridgeExists: boolean;
}

export interface McpPublicState {
  enabled: boolean;
  port: number;
  allowRiskyTools: boolean;
  state: McpServerState;
  url: string;
  error?: string;
  lastRequestAt?: number;
  setup: McpSetupInfo;
}

export interface McpSettingsPatch {
  enabled?: boolean;
  port?: number;
  allowRiskyTools?: boolean;
}
