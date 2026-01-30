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
  | 'custom'
  | 'zustand'
  | 'websocket';

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

  // Battery
  'adb:get-battery': (deviceId: string) => Promise<BatteryInfo | null>;
  'adb:start-battery-monitor': (deviceId: string, interval: number) => void;
  'adb:stop-battery-monitor': () => void;

  // Crash Logcat
  'adb:start-crash-logcat': (deviceId: string) => void;
  'adb:stop-crash-logcat': () => void;
  'adb:clear-crash-logcat': (deviceId: string) => Promise<void>;

  // Services
  'adb:get-services': (deviceId: string, packageName?: string) => Promise<ServiceInfo[]>;

  // Network Stats
  'adb:get-network-stats': (deviceId: string, packageName?: string) => Promise<AppNetworkStats | null>;
  'adb:start-network-stats-monitor': (deviceId: string, packageName: string, interval: number) => void;
  'adb:stop-network-stats-monitor': () => void;

  // Activity Stack
  'adb:get-activity-stack': (deviceId: string, packageName: string) => Promise<ActivityStackInfo | null>;

  // Job Scheduler
  'adb:get-scheduled-jobs': (deviceId: string, packageName?: string) => Promise<JobSchedulerInfo | null>;

  // Alarm Monitor
  'adb:get-scheduled-alarms': (deviceId: string, packageName?: string) => Promise<AlarmMonitorInfo | null>;

  // Thread Monitor
  'profiler:get-threads': (deviceId: string, packageName: string) => Promise<ThreadSnapshot | null>;
  'profiler:start-thread-monitor': (deviceId: string, packageName: string, interval: number) => void;
  'profiler:stop-thread-monitor': () => void;

  // GC Monitor
  'profiler:start-gc-monitor': (deviceId: string, packageName: string) => void;
  'profiler:stop-gc-monitor': () => void;

  // Heap Dump
  'profiler:capture-heap-dump': (deviceId: string, packageName: string) => Promise<HeapDumpInfo>;
  'profiler:analyze-heap-dump': (filePath: string) => Promise<HeapAnalysis | null>;
  'profiler:get-heap-instances': (filePath: string, classId: number) => Promise<HeapInstance[]>;

  // Method Trace
  'profiler:start-method-trace': (deviceId: string, packageName: string) => Promise<{ success: boolean; error?: string }>;
  'profiler:stop-method-trace': (deviceId: string, packageName: string) => Promise<MethodTraceInfo>;
  'profiler:analyze-method-trace': (filePath: string) => Promise<MethodTraceAnalysis | null>;
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
  'battery-update': BatteryInfo;
  'crash-entry': CrashEntry;
  'network-stats-update': AppNetworkStats;
  'thread-update': ThreadSnapshot;
  'gc-event': GcEvent;
  'heap-dump-progress': { id: string; status: HeapDumpStatus; progress?: number; error?: string };
  'method-trace-progress': { id: string; status: MethodTraceStatus; duration?: number; error?: string };
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

// Battery types
export interface BatteryInfo {
  timestamp: number;
  level: number;           // 0-100
  temperature: number;     // Celsius (raw / 10)
  health: 'good' | 'overheat' | 'dead' | 'over_voltage' | 'cold' | 'unknown';
  status: 'charging' | 'discharging' | 'not_charging' | 'full' | 'unknown';
  plugged: 'ac' | 'usb' | 'wireless' | 'none';
  voltage: number;         // mV
}

// Crash types
export interface CrashEntry {
  id: string;
  timestamp: string;
  processName: string;
  pid: number;
  signal?: string;        // SIGSEGV, SIGABRT, etc.
  message: string;
  stackTrace: string[];
  raw: string;
}

// Service types
export interface ServiceInfo {
  name: string;            // Service class name
  packageName: string;
  pid: number;
  state: 'started' | 'bound' | 'started+bound';
  foreground: boolean;
  clientCount: number;
}

// Network Stats types
export interface NetworkStats {
  timestamp: number;
  rxBytes: number;         // Received
  txBytes: number;         // Transmitted
  rxPackets: number;
  txPackets: number;
}

export interface AppNetworkStats {
  packageName: string;
  wifi: NetworkStats;
  mobile: NetworkStats;
}

// Activity Stack types
export interface ActivityInfo {
  name: string;              // e.g., "com.example/.MainActivity"
  shortName: string;         // e.g., "MainActivity"
  packageName: string;
  taskId: number;
  state: 'resumed' | 'paused' | 'stopped' | 'destroyed';
  isTop: boolean;
}

export interface TaskStack {
  taskId: number;
  rootActivity: string;
  activities: ActivityInfo[];
  isVisible: boolean;
}

export interface ActivityStackInfo {
  timestamp: number;
  packageName: string;
  tasks: TaskStack[];
  focusedActivity?: string;
}

// Job Scheduler types
export interface ScheduledJob {
  jobId: number;
  packageName: string;
  serviceName: string;
  state: 'pending' | 'active' | 'ready' | 'waiting';
  constraints: {
    requiresCharging: boolean;
    requiresDeviceIdle: boolean;
    requiresNetwork: 'none' | 'any' | 'unmetered' | 'cellular';
    requiresBatteryNotLow: boolean;
    requiresStorageNotLow: boolean;
  };
  timing: {
    periodicInterval?: number;
    minLatency?: number;
    lastRunTime?: number;
    nextRunTime?: number;
  };
  isPersisted: boolean;
}

export interface JobSchedulerInfo {
  timestamp: number;
  packageName?: string;
  jobs: ScheduledJob[];
}

// Alarm Monitor types
export interface ScheduledAlarm {
  id: string;
  packageName: string;
  type: 'RTC' | 'RTC_WAKEUP' | 'ELAPSED_REALTIME' | 'ELAPSED_REALTIME_WAKEUP';
  triggerTime: number;
  repeatInterval?: number;
  operation: string;
  tag?: string;
  isExact: boolean;
  isRepeating: boolean;
}

export interface AlarmMonitorInfo {
  timestamp: number;
  packageName?: string;
  alarms: ScheduledAlarm[];
  nextAlarmTime?: number;
}

// Zustand (SDK) types
export interface ZustandStoreSnapshot {
  name: string;
  state: unknown;
  previousState?: unknown;
  timestamp: number;
}

// App Installer types
export interface InstallOptions {
  reinstall?: boolean;        // -r flag
  allowDowngrade?: boolean;   // -d flag
  grantPermissions?: boolean; // -g flag
}

export type InstallStage = 'idle' | 'validating' | 'extracting' | 'pushing' | 'installing' | 'complete' | 'error';

export interface InstallProgress {
  stage: InstallStage;
  percent: number;
  message: string;
}

export interface InstallResult {
  success: boolean;
  packageName?: string;
  error?: string;
  errorCode?: string;
}

export interface DeviceSpec {
  abis: string[];
  screenDensity: number;
  sdkVersion: number;
}

export interface SelectedAppFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  fileType: 'apk' | 'aab';
}

// Thread Monitor types
export type ThreadState = 'running' | 'sleeping' | 'waiting' | 'blocked' | 'zombie' | 'stopped' | 'unknown';

export interface ThreadInfo {
  id: number;
  name: string;
  state: ThreadState;
  cpuTime: number;
  priority: number;
}

export interface ThreadSnapshot {
  timestamp: number;
  threads: ThreadInfo[];
}

// GC Monitor types
export type GcReason = 'ALLOC' | 'CONCURRENT' | 'EXPLICIT' | 'FOR_ALLOC' | 'BACKGROUND' | 'UNKNOWN';

export interface GcEvent {
  id: string;
  timestamp: number;
  reason: GcReason;
  freedBytes: number;
  heapUsed: number;
  heapTotal: number;
  pauseTimeMs: number;
}

export interface GcStats {
  totalGcCount: number;
  totalPauseTime: number;
  avgPauseTime: number;
  allocationRate: number;
}

// Heap Dump types
export type HeapDumpStatus = 'capturing' | 'parsing' | 'ready' | 'error';

export interface HeapDumpInfo {
  id: string;
  timestamp: number;
  filePath: string;
  fileSize: number;
  status: HeapDumpStatus;
  error?: string;
}

export interface HeapClass {
  id: number;
  name: string;
  instanceCount: number;
  shallowSize: number;
  retainedSize: number;
}

export interface HeapInstance {
  id: number;
  classId: number;
  className: string;
  shallowSize: number;
  fields: { name: string; type: string; value: unknown }[];
}

export interface HeapAnalysis {
  totalObjects: number;
  totalSize: number;
  classes: HeapClass[];
}

// Method Trace types
export type MethodTraceStatus = 'recording' | 'parsing' | 'ready' | 'error';

export interface MethodTraceInfo {
  id: string;
  timestamp: number;
  duration: number;
  filePath?: string;
  status: MethodTraceStatus;
  error?: string;
}

export interface MethodStats {
  className: string;
  methodName: string;
  inclusiveTime: number;
  exclusiveTime: number;
  callCount: number;
}

export interface FlameChartEntry {
  name: string;
  value: number;
  children?: FlameChartEntry[];
}

export interface MethodTraceAnalysis {
  totalTime: number;
  methods: MethodStats[];
  flameChart: FlameChartEntry;
}

// WebSocket (SDK) types
export interface WebSocketConnection {
  id: string;
  url: string;
  protocol?: string;
  readyState: 0 | 1 | 2 | 3;
  openedAt?: number;
  closedAt?: number;
}

export interface WebSocketMessage {
  id: string;
  connectionId: string;
  direction: 'sent' | 'received';
  type: 'text' | 'binary';
  data: string;
  size: number;
  timestamp: number;
}

export interface WebSocketEvent {
  connectionId: string;
  event: 'open' | 'close' | 'error' | 'message';
  timestamp: number;
  data?: WebSocketMessage;
  error?: string;
}
