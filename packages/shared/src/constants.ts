// Polling intervals (ms)
export const MEMORY_POLL_INTERVAL = 1000;
export const CPU_POLL_INTERVAL = 1000;
export const FPS_POLL_INTERVAL = 1000;
export const DEVICE_POLL_INTERVAL = 3000;
export const BATTERY_POLL_INTERVAL = 5000;
export const NETWORK_STATS_POLL_INTERVAL = 5000;
export const ACTIVITY_STACK_POLL_INTERVAL = 2000;
export const JOB_SCHEDULER_POLL_INTERVAL = 5000;
export const ALARM_MONITOR_POLL_INTERVAL = 5000;

// Memory leak detection thresholds (MB)
export const MEMORY_WARNING_THRESHOLD = 300;
export const MEMORY_CRITICAL_THRESHOLD = 500;
export const MEMORY_LEAK_INCREASE_THRESHOLD = 50; // MB increase over time

// Log colors
export const LOG_LEVEL_COLORS: Record<string, string> = {
  V: '#6b7280', // gray
  D: '#3b82f6', // blue
  I: '#22c55e', // green
  W: '#eab308', // yellow
  E: '#ef4444', // red
  F: '#dc2626', // dark red
  S: '#9333ea', // purple
};

// React Native log tags
export const REACT_NATIVE_LOG_TAGS = [
  'ReactNative',
  'ReactNativeJS',
  'RCTLog',
  'ReactNativeCore',
  'Hermes',
  'HermesVM',
];

// Max data points to keep in memory
export const MAX_MEMORY_DATA_POINTS = 300; // 5 minutes at 1s interval
export const MAX_CPU_DATA_POINTS = 300;
export const MAX_FPS_DATA_POINTS = 300;
export const MAX_LOG_ENTRIES = 10000;
export const MAX_BATTERY_DATA_POINTS = 60; // 5 minutes at 5s interval
export const MAX_NETWORK_STATS_DATA_POINTS = 60;
export const MAX_CRASH_ENTRIES = 100;

// App info
export const APP_NAME = 'Android Debugger';
export const APP_VERSION = '1.0.0';
