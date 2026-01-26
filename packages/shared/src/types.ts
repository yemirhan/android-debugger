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
  | 'ping'
  | 'pong';

export interface SdkMessage {
  type: SdkMessageType;
  timestamp: number;
  payload: unknown;
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

  // WebSocket server
  'ws:start-server': (port: number) => Promise<void>;
  'ws:stop-server': () => Promise<void>;
  'ws:get-connections': () => number;
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
  'sdk-connection': { connected: boolean; clientId: string };
  'error': { source: string; message: string };
}
