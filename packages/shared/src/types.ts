// Device types
export interface Device {
  id: string;
  model: string;
  androidVersion: string;
  status: 'device' | 'offline' | 'unauthorized';
}

// Memory types
export interface MemoryInfo {
  timestamp: number;
  totalPss: number;
  javaHeap: number;
  nativeHeap: number;
  graphics: number;
  stack: number;
  code: number;
  system: number;
  other: number;
}

export interface MemorySnapshot {
  packageName: string;
  data: MemoryInfo[];
}

// Log types
export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  pid?: number;
  tid?: number;
}

// CPU types
export interface CpuInfo {
  timestamp: number;
  usage: number;
}

// FPS types
export interface FpsInfo {
  timestamp: number;
  fps: number;
  jankyFrames: number;
  totalFrames: number;
  percentile90: number;
  percentile95: number;
  percentile99: number;
}

// Network types (for SDK)
export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  duration?: number;
  error?: string;
}

// SDK Message types
export type SdkMessageType =
  | 'console'
  | 'network'
  | 'state'
  | 'performance'
  | 'custom';

export interface SdkMessage {
  type: SdkMessageType;
  timestamp: number;
  payload: unknown;
}

// Logcat transport chunk data
export interface ChunkData {
  sequenceId: string;
  index: number;
  total: number;
  compressed: boolean;
  data: string;
}

export interface ConsoleMessage {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: unknown[];
  timestamp: number;
}

export interface StateSnapshot {
  name: string;
  state: unknown;
  timestamp: number;
}

export interface PerformanceMark {
  name: string;
  startTime: number;
  duration?: number;
}

export interface CustomEvent {
  name: string;
  data: unknown;
  timestamp: number;
}

// App Metadata types
export interface AppMetadata {
  packageName: string;
  versionName: string;
  versionCode: number;
  targetSdk: number;
  minSdk: number;
  firstInstallTime: string;
  lastUpdateTime: string;
  apkSize: number;
  dataSize: number;
  cacheSize: number;
  permissions: string[];
  isDebuggable: boolean;
  isSystem: boolean;
}

// Developer Options types
export interface DeveloperOptions {
  layoutBounds: boolean;
  gpuOverdraw: 'off' | 'show' | 'show_deuteranomaly';
  windowAnimationScale: number;
  transitionAnimationScale: number;
  animatorDurationScale: number;
  showTouches: boolean;
  pointerLocation: boolean;
}

// File Inspector types
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  permissions: string;
}

export interface SharedPreference {
  file: string;
  entries: Record<string, { type: string; value: unknown }>;
}

export interface DatabaseInfo {
  name: string;
  path: string;
  tables: string[];
  size: number;
}

export interface DatabaseQueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

// Intent Tester types
export interface IntentConfig {
  id: string;
  name: string;
  action: string;
  data?: string;
  type?: string;
  category?: string;
  component?: string;
  extras: IntentExtra[];
  flags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface IntentExtra {
  key: string;
  type: 'string' | 'int' | 'long' | 'float' | 'double' | 'boolean' | 'uri';
  value: string;
}

export interface IntentHistoryEntry {
  id: string;
  intent: IntentConfig;
  timestamp: number;
  success: boolean;
  error?: string;
}

// Screen Capture types
export interface ScreenshotResult {
  path: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface RecordingState {
  isRecording: boolean;
  startTime?: number;
  outputPath?: string;
}

// IPC types
export interface IpcChannels {
  // Device
  'adb:get-devices': () => Promise<Device[]>;
  'adb:get-device-info': (deviceId: string) => Promise<Device | null>;

  // Memory
  'adb:get-meminfo': (deviceId: string, packageName: string) => Promise<MemoryInfo | null>;
  'adb:start-memory-monitor': (deviceId: string, packageName: string, interval: number) => void;
  'adb:stop-memory-monitor': () => void;

  // Logs
  'adb:start-logcat': (deviceId: string, filters?: string[]) => void;
  'adb:stop-logcat': () => void;
  'adb:clear-logcat': (deviceId: string) => Promise<void>;

  // CPU
  'adb:get-cpu': (deviceId: string, packageName: string) => Promise<CpuInfo | null>;
  'adb:start-cpu-monitor': (deviceId: string, packageName: string, interval: number) => void;
  'adb:stop-cpu-monitor': () => void;

  // FPS
  'adb:get-fps': (deviceId: string, packageName: string) => Promise<FpsInfo | null>;
  'adb:start-fps-monitor': (deviceId: string, packageName: string, interval: number) => void;
  'adb:stop-fps-monitor': () => void;

  // App management
  'adb:get-packages': (deviceId: string, debuggableOnly?: boolean) => Promise<string[]>;
  'adb:launch-app': (deviceId: string, packageName: string) => Promise<void>;
  'adb:kill-app': (deviceId: string, packageName: string) => Promise<void>;
  'adb:clear-app-data': (deviceId: string, packageName: string) => Promise<void>;


  // App Metadata
  'adb:get-app-metadata': (deviceId: string, packageName: string) => Promise<AppMetadata | null>;

  // Screen Capture
  'screen:take-screenshot': (deviceId: string) => Promise<ScreenshotResult | null>;
  'screen:start-recording': (deviceId: string) => Promise<{ success: boolean; path?: string }>;
  'screen:stop-recording': (deviceId: string) => Promise<{ success: boolean; path?: string }>;

  // Developer Options
  'dev-options:get': (deviceId: string) => Promise<DeveloperOptions | null>;
  'dev-options:set-layout-bounds': (deviceId: string, enabled: boolean) => Promise<boolean>;
  'dev-options:set-gpu-overdraw': (deviceId: string, mode: DeveloperOptions['gpuOverdraw']) => Promise<boolean>;
  'dev-options:set-animation-scale': (deviceId: string, scale: number, type: 'window' | 'transition' | 'animator') => Promise<boolean>;
  'dev-options:set-show-touches': (deviceId: string, enabled: boolean) => Promise<boolean>;
  'dev-options:set-pointer-location': (deviceId: string, enabled: boolean) => Promise<boolean>;

  // File Inspector
  'files:list': (deviceId: string, packageName: string, path: string) => Promise<FileEntry[]>;
  'files:read': (deviceId: string, packageName: string, path: string) => Promise<string | null>;
  'files:read-shared-prefs': (deviceId: string, packageName: string) => Promise<SharedPreference[]>;
  'files:list-databases': (deviceId: string, packageName: string) => Promise<DatabaseInfo[]>;
  'files:query-database': (deviceId: string, packageName: string, dbName: string, query: string) => Promise<DatabaseQueryResult | null>;

  // Intent Tester
  'intent:fire': (deviceId: string, intent: IntentConfig) => Promise<{ success: boolean; error?: string }>;
  'intent:fire-deep-link': (deviceId: string, uri: string) => Promise<{ success: boolean; error?: string }>;
  'intent:save': (intent: IntentConfig) => Promise<void>;
  'intent:get-saved': () => Promise<IntentConfig[]>;
  'intent:delete-saved': (id: string) => Promise<void>;
  'intent:get-history': () => Promise<IntentHistoryEntry[]>;
  'intent:clear-history': () => Promise<void>;
}

// Event types from main to renderer
export interface IpcEvents {
  'memory-update': MemoryInfo;
  'log-entry': LogEntry;
  'cpu-update': CpuInfo;
  'fps-update': FpsInfo;
  'device-connected': Device;
  'device-disconnected': string;
  'sdk-message': SdkMessage;
  'error': { source: string; message: string };
  'recording-update': RecordingState;
}

// Auto-updater types
export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  version?: string;
  error?: string;
}

export interface UpdateSettings {
  autoCheckOnStartup: boolean;
  autoDownload: boolean;
}
