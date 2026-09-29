import type {
  AppNetworkStats,
  BatteryInfo,
  CpuInfo,
  FpsInfo,
  GcEvent,
  MemoryInfo,
  ThreadSnapshot,
} from '@android-debugger/shared';

/**
 * Background monitors. The renderer owns exactly one of each kind for the
 * selected device/app; the main process runs one poller per kind.
 *
 * Every start carries a renderer-chosen session number that the main process
 * echoes on each sample, so samples from a previous target (still in flight
 * when the renderer switched) can be dropped.
 */
export interface MonitorPayloads {
  memory: MemoryInfo;
  cpu: CpuInfo;
  fps: FpsInfo;
  battery: BatteryInfo;
  'network-stats': AppNetworkStats;
  threads: ThreadSnapshot;
  gc: GcEvent;
}

export type MonitorKind = keyof MonitorPayloads;

/** payload is MonitorPayloads[kind]. */
export type MonitorSampleListener = (kind: MonitorKind, session: number, payload: unknown) => void;

export interface MonitorApi {
  /** Start (or restart) the monitor of this kind. Device-wide kinds ignore packageName. */
  startMonitor: (kind: MonitorKind, deviceId: string, packageName: string, interval: number, session: number) => void;
  stopMonitor: (kind: MonitorKind) => void;
  onMonitorSample: (callback: MonitorSampleListener) => () => void;
}
