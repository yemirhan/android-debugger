import { spawn, execFile, ChildProcess, type ExecFileOptions } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type {
  Device,
  MemoryInfo,
  CpuInfo,
  FpsInfo,
  LogEntry,
  AppMetadata,
  DeveloperOptions,
  FileEntry,
  SharedPreference,
  DatabaseInfo,
  DatabaseQueryResult,
  IntentConfig,
  ScreenshotResult,
  RecordingState,
  SdkMessage,
  BatteryInfo,
  CrashEntry,
  ServiceInfo,
  AppNetworkStats,
  ActivityStackInfo,
  JobSchedulerInfo,
  AlarmMonitorInfo,
  InstallOptions,
  InstallResult,
  DeviceSpec,
  InstallProgress,
  ThreadInfo,
  ThreadSnapshot,
  ThreadState,
  GcEvent,
  GcReason,
  HeapDumpInfo,
  HeapInstance,
  HeapAnalysis,
  MethodTraceInfo,
  MethodTraceAnalysis,
} from '@android-debugger/shared';
import { v4 as uuidv4 } from 'uuid';
import { LogcatMessageParser } from './logcat-parser';
import { parseLogcatEpoch } from './monitor-protocol';
import {
  Batcher,
  LineSplitter,
  TailBuffer,
  buildHistoryArgs,
  buildSdkStreamArgs,
  buildStreamArgs,
  formatLogcatSince,
  parseDeviceEpoch,
  parseLogcatLine,
  type LogBatch,
  type LogHistoryRequest,
  type LogHistoryResult,
  type LogLine,
  type LogStreamRequest,
  type LogStreamStatus,
  type LogcatSelector,
} from './logcat-format';
import { parseCmdWifiStatus, parseDumpsysWifi } from './wifi-parser';
import { parseAmStartError, parseResolvedActivity } from './launch-parsers';
import { ANDROID_KEY_NAMES, androidKeyCode } from './android-keys';
import { parseHprof, parseMethodTrace } from './profiler-parsers';
import {
  shellQuote,
  parseTopCpuUsage,
  parseFpsInfo,
  parseBatteryInfo,
  parseServicesInfo,
  parseActivityStack,
  parseScheduledJobs,
  parseScheduledAlarms,
  parsePackageUid,
  parseNetworkStats,
  parseLsEntries,
  parseSharedPrefsXml,
  parseAppMetadata,
} from './device-parsers';

const execFileAsync = promisify(execFile);

interface CommandResult {
  stdout: string;
  stderr: string;
}

async function runCommand(
  executable: string,
  args: readonly string[] = [],
  options: ExecFileOptions = {}
): Promise<CommandResult> {
  const result = await execFileAsync(executable, [...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });

  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

async function runCommandBuffer(
  executable: string,
  args: readonly string[] = [],
  options: ExecFileOptions = {}
): Promise<{ stdout: Buffer; stderr: Buffer }> {
  const result = await execFileAsync(executable, [...args], {
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  return {
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ''),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ''),
  };
}

function assertDeviceId(deviceId: string): void {
  if (!deviceId || !/^[A-Za-z0-9._:-]+$/.test(deviceId)) {
    throw new Error('Invalid Android device ID');
  }
}

function assertPackageName(packageName: string): void {
  if (!packageName || !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName)) {
    throw new Error('Invalid Android package name');
  }
}

// A hung adb command (offline device, wedged adb server) would otherwise
// block its caller forever, e.g. freezing a monitor's polling loop. execFile
// kills the child when the timeout elapses and rejects the promise.
const DEFAULT_ADB_TIMEOUT_MS = 30_000;
// GC monitor: how often to look for the app when it isn't running, and how
// often to check whether it restarted under a new PID.
const GC_MONITOR_RETRY_MS = 3_000;
const GC_MONITOR_PID_CHECK_MS = 5_000;
// For transfers and installs whose duration scales with file size and link
// speed (e.g. Wi-Fi adb); these must never be cut short. 0 disables the timeout.
const NO_TIMEOUT = 0;

async function runAdb(
  deviceId: string | null,
  args: readonly string[],
  options: ExecFileOptions = {}
): Promise<CommandResult> {
  const adbArgs = [...args];
  if (deviceId !== null) {
    assertDeviceId(deviceId);
    adbArgs.unshift('-s', deviceId);
  }
  return runCommand('adb', adbArgs, { timeout: DEFAULT_ADB_TIMEOUT_MS, ...options });
}

async function runAdbBuffer(
  deviceId: string,
  args: readonly string[],
  options: ExecFileOptions = {}
): Promise<{ stdout: Buffer; stderr: Buffer }> {
  assertDeviceId(deviceId);
  return runCommandBuffer('adb', ['-s', deviceId, ...args], { timeout: DEFAULT_ADB_TIMEOUT_MS, ...options });
}

export interface LogStreamHandlers {
  onBatch: (batch: LogBatch) => void;
  onStatus: (status: LogStreamStatus) => void;
}
type SdkMessageCallback = (message: SdkMessage) => void;
type CrashCallback = (entry: CrashEntry) => void;
type ThreadCallback = (snapshot: ThreadSnapshot) => void;
type GcEventCallback = (event: GcEvent) => void;

export class AdbService extends EventEmitter {
  private logcatProcess: ChildProcess | null = null;
  private sdkLogcatProcess: ChildProcess | null = null;
  private crashLogcatProcess: ChildProcess | null = null;
  private memoryInterval: NodeJS.Timeout | null = null;
  private cpuInterval: NodeJS.Timeout | null = null;
  private fpsInterval: NodeJS.Timeout | null = null;
  private batteryInterval: NodeJS.Timeout | null = null;
  private networkStatsInterval: NodeJS.Timeout | null = null;
  private memoryMonitorGeneration = 0;
  private cpuMonitorGeneration = 0;
  private fpsMonitorGeneration = 0;
  private batteryMonitorGeneration = 0;
  private networkMonitorGeneration = 0;
  private logcatParser: LogcatMessageParser = new LogcatMessageParser();
  private sdkMessageCallback: SdkMessageCallback | null = null;
  private logStreamGeneration = 0;
  private logStreamBatcher: Batcher<LogLine> | null = null;
  private logHistoryCounter = 0;
  private sdkStreamGeneration = 0;
  private sdkBatcher: Batcher<SdkMessage> | null = null;

  // Profiler properties
  private threadMonitorInterval: NodeJS.Timeout | null = null;
  private threadMonitorGeneration = 0;
  private gcMonitorProcess: ChildProcess | null = null;
  private gcMonitorGeneration = 0;
  private gcMonitorTimer: NodeJS.Timeout | null = null;
  /** Last logcat time read for the current GC target (see startGcMonitor). */
  private gcStreamCursor: { key: string; epoch: number } | null = null;
  private methodTraceActive: boolean = false;
  private methodTraceStarting: boolean = false;
  private methodTraceGeneration = 0;
  private methodTraceStartTime: number = 0;
  private methodTraceDeviceId: string | null = null;
  private methodTracePackageName: string | null = null;
  private methodTraceRemotePath: string | null = null;

  constructor() {
    super();
  }

  /**
   * Set callback for SDK messages parsed from logcat
   */
  onSdkMessage(callback: SdkMessageCallback): void {
    this.sdkMessageCallback = callback;
  }

  async getDevices(): Promise<Device[]> {
    try {
      const { stdout } = await runAdb(null, ['devices', '-l']);
      const entries = stdout
        .trim()
        .split('\n')
        .slice(1)
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.split(/\s+/);
          return { id: parts[0], status: parts[1] as Device['status'] };
        });

      // Forget cached props for serials that went away (an emulator port can
      // be reused by a different AVD).
      const present = new Set(entries.map((entry) => entry.id));
      for (const id of [...this.staticDeviceInfo.keys()]) {
        if (!present.has(id)) this.staticDeviceInfo.delete(id);
      }

      // Query ready devices in parallel so one slow device doesn't delay the
      // whole poll by the sum of every device's round trips.
      const devices = await Promise.all(
        entries.map(({ id, status }): Promise<Device | null> | Device =>
          status === 'device'
            ? this.getDeviceInfo(id)
            : { id, model: 'Unknown', androidVersion: 'Unknown', status }
        )
      );
      return devices.filter((device): device is Device => device !== null);
    } catch (error) {
      console.error('Error getting devices:', error);
      return [];
    }
  }

  // Model and Android version don't change while a device stays connected, so
  // they're read once per serial. Wi-Fi is re-read on every poll.
  private staticDeviceInfo = new Map<string, { model: string; androidVersion: string }>();
  /** Serials whose Android version has no `cmd wifi status` (pre-Android 11). */
  private noCmdWifiStatus = new Set<string>();

  async getDeviceInfo(deviceId: string): Promise<Device | null> {
    try {
      assertDeviceId(deviceId);
      const [info, wifiName] = await Promise.all([
        this.getStaticDeviceInfo(deviceId),
        this.getWifiName(deviceId),
      ]);

      return {
        id: deviceId,
        model: info.model,
        androidVersion: info.androidVersion,
        status: 'device',
        wifiName,
      };
    } catch (error) {
      console.error('Error getting device info:', error);
      return null;
    }
  }

  private async getStaticDeviceInfo(deviceId: string): Promise<{ model: string; androidVersion: string }> {
    const cached = this.staticDeviceInfo.get(deviceId);
    if (cached) return cached;
    const [modelResult, versionResult] = await Promise.all([
      runAdb(deviceId, ['shell', 'getprop', 'ro.product.model'], { timeout: 10_000 }),
      runAdb(deviceId, ['shell', 'getprop', 'ro.build.version.release'], { timeout: 10_000 }),
    ]);
    const info = {
      model: modelResult.stdout.trim() || 'Unknown',
      androidVersion: versionResult.stdout.trim() || 'Unknown',
    };
    // Only cache real answers; a device that is still booting can report empty props.
    if (info.model !== 'Unknown' && info.androidVersion !== 'Unknown') {
      this.staticDeviceInfo.set(deviceId, info);
    }
    return info;
  }

  /**
   * The SSID the device is connected to right now, or null when Wi-Fi is off
   * or not associated. `cmd wifi status` is authoritative whenever it answers;
   * `dumpsys wifi` is only a fallback for devices without it, and only its live
   * `mWifiInfo` line is read (saved networks and history list old SSIDs).
   */
  private async getWifiName(deviceId: string): Promise<string | null> {
    if (!this.noCmdWifiStatus.has(deviceId)) {
      const unsupported = /unknown command|can't find service|no shell command/i;
      try {
        const { stdout, stderr } = await runAdb(deviceId, ['shell', 'cmd', 'wifi', 'status'], { timeout: 5_000 });
        const status = parseCmdWifiStatus(stdout);
        if (status.state === 'connected') return status.ssid;
        if (status.state === 'disconnected') return null;
        if (unsupported.test(`${stdout}\n${stderr}`)) this.noCmdWifiStatus.add(deviceId);
      } catch (error) {
        // Old Android versions exit non-zero for the unknown subcommand.
        const { stdout = '', stderr = '' } = (error ?? {}) as { stdout?: string; stderr?: string };
        if (unsupported.test(`${stdout}\n${stderr}`)) this.noCmdWifiStatus.add(deviceId);
      }
    }

    try {
      const { stdout } = await runAdb(deviceId, ['shell', 'dumpsys', 'wifi'], { timeout: 10_000 });
      const status = parseDumpsysWifi(stdout);
      return status.state === 'connected' ? status.ssid : null;
    } catch {
      return null;
    }
  }

  async getMemInfo(deviceId: string, packageName: string): Promise<MemoryInfo | null> {
    if (!deviceId || !packageName) {
      return null;
    }
    try {
      assertPackageName(packageName);
      const { stdout } = await runAdb(deviceId, ['shell', 'dumpsys', 'meminfo', packageName]);

      return this.parseMemInfo(stdout);
    } catch (error) {
      console.error('Error getting memory info:', error);
      return null;
    }
  }

  private parseMemInfo(output: string): MemoryInfo | null {
    try {
      const lines = output.split('\n');
      const info: Partial<MemoryInfo> = {
        timestamp: Date.now(),
      };

      for (const line of lines) {
        const trimmed = line.trim();

        // Parse TOTAL line
        if (trimmed.startsWith('TOTAL')) {
          const match = trimmed.match(/TOTAL\s+(\d+)/);
          if (match) {
            info.totalPss = parseInt(match[1], 10);
          }
        }

        // Parse individual memory sections
        if (trimmed.includes('Java Heap:')) {
          const match = trimmed.match(/Java Heap:\s*(\d+)/);
          if (match) info.javaHeap = parseInt(match[1], 10);
        }
        if (trimmed.includes('Native Heap:')) {
          const match = trimmed.match(/Native Heap:\s*(\d+)/);
          if (match) info.nativeHeap = parseInt(match[1], 10);
        }
        if (trimmed.includes('Graphics:')) {
          const match = trimmed.match(/Graphics:\s*(\d+)/);
          if (match) info.graphics = parseInt(match[1], 10);
        }
        if (trimmed.includes('Stack:')) {
          const match = trimmed.match(/Stack:\s*(\d+)/);
          if (match) info.stack = parseInt(match[1], 10);
        }
        if (trimmed.includes('Code:')) {
          const match = trimmed.match(/Code:\s*(\d+)/);
          if (match) info.code = parseInt(match[1], 10);
        }
        if (trimmed.includes('System:')) {
          const match = trimmed.match(/System:\s*(\d+)/);
          if (match) info.system = parseInt(match[1], 10);
        }

        // Alternative parsing for summary format
        const summaryMatch = trimmed.match(
          /(\w[\w\s]+):\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
        );
        if (summaryMatch) {
          const category = summaryMatch[1].trim().toLowerCase();
          const pss = parseInt(summaryMatch[2], 10);

          if (category.includes('java heap')) info.javaHeap = pss;
          else if (category.includes('native heap')) info.nativeHeap = pss;
          else if (category.includes('graphics')) info.graphics = pss;
          else if (category.includes('stack')) info.stack = pss;
          else if (category.includes('code')) info.code = pss;
          else if (category.includes('system')) info.system = pss;
        }
      }

      // Calculate other if we have total
      if (info.totalPss) {
        const known =
          (info.javaHeap || 0) +
          (info.nativeHeap || 0) +
          (info.graphics || 0) +
          (info.stack || 0) +
          (info.code || 0) +
          (info.system || 0);
        info.other = Math.max(0, info.totalPss - known);
      }

      // Validate we have at least total PSS
      if (!info.totalPss) {
        // Try alternative parsing
        const totalMatch = output.match(/TOTAL\s+PSS:\s*(\d+)/i);
        if (totalMatch) {
          info.totalPss = parseInt(totalMatch[1], 10);
        } else {
          return null;
        }
      }

      return {
        timestamp: info.timestamp!,
        totalPss: info.totalPss,
        javaHeap: info.javaHeap || 0,
        nativeHeap: info.nativeHeap || 0,
        graphics: info.graphics || 0,
        stack: info.stack || 0,
        code: info.code || 0,
        system: info.system || 0,
        other: info.other || 0,
      };
    } catch (error) {
      console.error('Error parsing meminfo:', error);
      return null;
    }
  }

  startMemoryMonitor(
    deviceId: string,
    packageName: string,
    interval: number,
    callback: (info: MemoryInfo) => void
  ): void {
    this.stopMemoryMonitor();

    if (!deviceId || !packageName) {
      return;
    }

    const generation = ++this.memoryMonitorGeneration;
    const poll = async () => {
      const info = await this.getMemInfo(deviceId, packageName);
      if (generation !== this.memoryMonitorGeneration) return;
      if (info) {
        callback(info);
      }
      this.memoryInterval = setTimeout(poll, Math.max(250, interval));
    };
    void poll();
  }

  stopMemoryMonitor(): void {
    this.memoryMonitorGeneration++;
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
  }

  /**
   * Get the PID of a running app by package name
   */
  async getPid(deviceId: string, packageName: string): Promise<number | null> {
    try {
      assertPackageName(packageName);
      const { stdout } = await runAdb(deviceId, ['shell', 'pidof', '-s', packageName]);
      const pid = parseInt(stdout.trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch (error) {
      console.log(`[AdbService] Could not get PID for ${packageName}:`, error);
      return null;
    }
  }

  /**
   * Get the Linux UID of an installed package. Unlike the PID, it survives app
   * restarts, so it's the better logcat filter.
   */
  async getUid(deviceId: string, packageName: string): Promise<number | null> {
    try {
      assertPackageName(packageName);
      const { stdout } = await runAdb(deviceId, ['shell', 'cmd', 'package', 'list', 'packages', '-U', packageName]);
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.trim().match(/^package:(\S+)\s+uid:(\d+)/);
        if (match && match[1] === packageName) return parseInt(match[2], 10);
      }
      return null;
    } catch (error) {
      console.log(`[AdbService] Could not get UID for ${packageName}:`, error);
      return null;
    }
  }

  /**
   * Resolves how to scope logcat to one app: the uid (Android 9+, survives app
   * restarts) or, on older devices, the current pid. Both are missing when the
   * app is not installed / not running.
   */
  async resolveLogTarget(deviceId: string, packageName: string): Promise<{ uid?: number; pid?: number }> {
    const sdk = await this.getDeviceSdkVersion(deviceId);
    if (sdk === 0 || sdk >= 28) {
      const uid = await this.getUid(deviceId, packageName);
      if (uid) return { uid };
    }
    const pid = await this.getPid(deviceId, packageName);
    return pid ? { pid } : {};
  }

  /** Device wall-clock time, so logcat can start at "now" (`-T`). */
  async getDeviceLogcatNow(deviceId: string): Promise<{ since: string; epochMs: number } | null> {
    try {
      const { stdout } = await runAdb(deviceId, ['shell', 'date', '+%s.%N'], { timeout: 5_000 });
      return parseDeviceEpoch(stdout);
    } catch {
      return null;
    }
  }

  /**
   * Starts the visible log stream. Lines are parsed here and delivered in
   * batches (~13/s) rather than one IPC message per line. The stream starts at
   * the device's current time, so the ring buffer is never replayed; older
   * lines are only loaded on request via loadLogHistory().
   */
  async startLogStream(request: LogStreamRequest, handlers: LogStreamHandlers): Promise<void> {
    this.stopLogcat();
    const generation = this.logStreamGeneration;
    const { sessionId, deviceId, mode, packageName } = request;
    const isCurrent = () => generation === this.logStreamGeneration;
    const status = (state: LogStreamStatus['state'], extra: Partial<LogStreamStatus> = {}) => {
      if (isCurrent()) handlers.onStatus({ sessionId, state, ...extra });
    };

    try {
      assertDeviceId(deviceId);
      status('starting');

      let selector: LogcatSelector = { mode };
      if (mode === 'app') {
        if (!packageName) {
          status('error', { message: 'Choose an app to see its logs.' });
          return;
        }
        assertPackageName(packageName);
        const target = await this.resolveLogTarget(deviceId, packageName);
        if (!isCurrent()) return;
        // Never fall back to the whole device's log when an app was asked for.
        if (!target.uid && !target.pid) {
          status('waiting-for-app', { message: `${packageName} is not running.` });
          return;
        }
        selector = { mode, ...target };
      }

      let since: string | null;
      let sinceEpochMs: number | undefined;
      if (request.resumeAfterEpochMs && request.resumeAfterEpochMs > 0) {
        sinceEpochMs = request.resumeAfterEpochMs + 1;
        since = formatLogcatSince(sinceEpochMs);
      } else {
        const now = await this.getDeviceLogcatNow(deviceId);
        if (!isCurrent()) return;
        since = now?.since ?? null;
        sinceEpochMs = now?.epochMs;
      }

      const child = spawn('adb', ['-s', deviceId, ...buildStreamArgs(selector, since)]);
      this.logcatProcess = child;
      child.stdout?.setEncoding('utf8');
      const splitter = new LineSplitter();
      let lineId = 0;
      let received = 0;
      let stderr = '';
      const batcher = new Batcher<LogLine>((entries, dropped) => {
        if (isCurrent()) handlers.onBatch({ sessionId, entries, dropped });
      });
      this.logStreamBatcher = batcher;

      const handleLines = (lines: string[]) => {
        for (const line of lines) {
          const entry = parseLogcatLine(line, `${sessionId}:${++lineId}`);
          // SDK transport chunks are internal; the SDK stream decodes them.
          if (!entry || entry.message.includes('SDKMSG:')) continue;
          received++;
          batcher.push(entry);
        }
      };

      child.stdout?.on('data', (data: string) => {
        if (this.logcatProcess !== child) return;
        handleLines(splitter.push(data));
      });
      child.stderr?.on('data', (data: Buffer) => {
        stderr = (stderr + data.toString()).slice(-2000);
      });
      child.on('error', (error) => {
        if (this.logcatProcess !== child) return;
        this.logcatProcess = null;
        batcher.dispose(true);
        status('error', { message: `Could not start adb logcat: ${error.message}` });
      });
      child.on('close', (code) => {
        if (this.logcatProcess !== child) return;
        handleLines(splitter.flush());
        batcher.dispose(true);
        this.logcatProcess = null;
        const detail = stderr.trim().split('\n').pop();
        status('ended', {
          message: detail || (received === 0 && code ? `adb logcat exited with code ${code}.` : undefined),
        });
      });

      status('streaming', { sinceEpochMs });
    } catch (error) {
      status('error', { message: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Returns the newest `limit` lines still in the device's ring buffer that are
   * older than `beforeEpochMs` (where the live stream started), so history can
   * be prepended without duplicating streamed lines.
   */
  async loadLogHistory(request: LogHistoryRequest): Promise<LogHistoryResult> {
    const { deviceId, mode, packageName, beforeEpochMs } = request;
    const limit = Math.min(Math.max(Math.floor(request.limit ?? 1000), 1), 20_000);
    try {
      assertDeviceId(deviceId);
      let selector: LogcatSelector = { mode };
      if (mode === 'app') {
        if (!packageName) return { entries: [], error: 'Choose an app first.' };
        assertPackageName(packageName);
        const target = await this.resolveLogTarget(deviceId, packageName);
        if (!target.uid && !target.pid) return { entries: [], error: `${packageName} is not running.` };
        selector = { mode, ...target };
      }

      const tail = new TailBuffer<LogLine>(limit);
      const historyId = ++this.logHistoryCounter;
      let lineId = 0;
      await new Promise<void>((resolve, reject) => {
        const child = spawn('adb', ['-s', deviceId, ...buildHistoryArgs(selector)]);
        child.stdout?.setEncoding('utf8');
        const splitter = new LineSplitter();
        let stderr = '';
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('Timed out reading the device log.'));
        }, DEFAULT_ADB_TIMEOUT_MS);
        const handle = (lines: string[]) => {
          for (const line of lines) {
            const entry = parseLogcatLine(line, `h${historyId}:${++lineId}`);
            if (!entry || entry.message.includes('SDKMSG:')) continue;
            if (beforeEpochMs && entry.epochMs && entry.epochMs >= beforeEpochMs) continue;
            tail.push(entry);
          }
        };
        child.stdout?.on('data', (data: string) => handle(splitter.push(data)));
        child.stderr?.on('data', (data: Buffer) => {
          stderr = (stderr + data.toString()).slice(-2000);
        });
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          handle(splitter.flush());
          if (code && stderr.trim()) reject(new Error(stderr.trim().split('\n').pop()));
          else resolve();
        });
      });
      return { entries: tail.toArray() };
    } catch (error) {
      return { entries: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Parses one logcat line (threadtime/year/zone or legacy `time` format). */
  private parseLogLine(line: string): LogEntry | null {
    return parseLogcatLine(line, uuidv4());
  }

  stopLogcat(): void {
    this.logStreamGeneration++;
    this.logStreamBatcher?.dispose();
    this.logStreamBatcher = null;
    if (this.logcatProcess) {
      const child = this.logcatProcess;
      this.logcatProcess = null;
      child.kill();
    }
  }

  /**
   * Starts the logcat stream that carries SDK messages (network, console,
   * state...). It only reads React Native tags, scoped to the app's uid when
   * known, and starts at "now" so old sessions are never replayed.
   */
  async startSdkLogcat(deviceId: string, packageName?: string): Promise<void> {
    this.stopSdkLogcat();
    const generation = this.sdkStreamGeneration;
    assertDeviceId(deviceId);
    this.logcatParser.reset();

    let target: { uid?: number; pid?: number } = {};
    if (packageName) {
      assertPackageName(packageName);
      target = await this.resolveLogTarget(deviceId, packageName);
    }
    const now = await this.getDeviceLogcatNow(deviceId);
    if (generation !== this.sdkStreamGeneration) return;

    const child = spawn('adb', ['-s', deviceId, ...buildSdkStreamArgs(target, now?.since ?? null)]);
    this.sdkLogcatProcess = child;
    // Decode as a stream so multi-byte UTF-8 characters split across chunks survive.
    child.stdout?.setEncoding('utf8');
    const splitter = new LineSplitter();
    // One IPC message per ~50ms instead of one per SDK message.
    const batcher = new Batcher<SdkMessage>((messages) => {
      if (this.sdkLogcatProcess === child) this.emit('sdk-messages', messages);
    }, 50);
    this.sdkBatcher = batcher;

    child.stdout?.on('data', (data: string) => {
      if (this.sdkLogcatProcess !== child) return;
      for (const line of splitter.push(data)) {
        const sdkMessage = this.logcatParser.parseLogLine(line);
        if (sdkMessage) {
          batcher.push(sdkMessage);
          this.sdkMessageCallback?.(sdkMessage);
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      console.error('SDK logcat error:', data.toString());
    });
    child.on('error', (error) => {
      console.error('SDK logcat process error:', error);
    });
    child.on('close', () => {
      if (this.sdkLogcatProcess === child) {
        batcher.dispose(true);
        this.sdkLogcatProcess = null;
      }
    });
  }

  stopSdkLogcat(): void {
    this.sdkStreamGeneration++;
    this.sdkBatcher?.dispose();
    this.sdkBatcher = null;
    if (this.sdkLogcatProcess) {
      const child = this.sdkLogcatProcess;
      this.sdkLogcatProcess = null;
      child.kill();
    }
    this.logcatParser.reset();
  }

  async clearLogcat(deviceId: string): Promise<void> {
    try {
      await runAdb(deviceId, ['logcat', '-c']);
    } catch (error) {
      console.error('Error clearing logcat:', error);
    }
  }

  async getCpuInfo(deviceId: string, packageName: string): Promise<CpuInfo | null> {
    if (!deviceId || !packageName) {
      return null;
    }
    try {
      assertPackageName(packageName);
      const { stdout } = await runAdb(deviceId, ['shell', 'top', '-n', '1', '-b']);
      const usage = parseTopCpuUsage(stdout, packageName);
      return usage === null ? null : { timestamp: Date.now(), usage };
    } catch (error) {
      console.error('Error getting CPU info:', error);
      return null;
    }
  }

  startCpuMonitor(
    deviceId: string,
    packageName: string,
    interval: number,
    callback: (info: CpuInfo) => void
  ): void {
    this.stopCpuMonitor();

    if (!deviceId || !packageName) {
      return;
    }

    const generation = ++this.cpuMonitorGeneration;
    const poll = async () => {
      const info = await this.getCpuInfo(deviceId, packageName);
      if (generation !== this.cpuMonitorGeneration) return;
      if (info) {
        callback(info);
      }
      this.cpuInterval = setTimeout(poll, Math.max(250, interval));
    };
    void poll();
  }

  stopCpuMonitor(): void {
    this.cpuMonitorGeneration++;
    if (this.cpuInterval) {
      clearInterval(this.cpuInterval);
      this.cpuInterval = null;
    }
  }

  async getFpsInfo(deviceId: string, packageName: string): Promise<FpsInfo | null> {
    if (!deviceId || !packageName) {
      return null;
    }
    try {
      assertPackageName(packageName);
      // Reset gfxinfo stats
      await runAdb(deviceId, ['shell', 'dumpsys', 'gfxinfo', packageName, 'reset']);

      // Wait a moment for frame data to accumulate
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { stdout } = await runAdb(deviceId, ['shell', 'dumpsys', 'gfxinfo', packageName, 'framestats']);

      return parseFpsInfo(stdout);
    } catch (error) {
      console.error('Error getting FPS info:', error);
      return null;
    }
  }

  startFpsMonitor(
    deviceId: string,
    packageName: string,
    interval: number,
    callback: (info: FpsInfo) => void
  ): void {
    this.stopFpsMonitor();

    if (!deviceId || !packageName) {
      return;
    }

    const generation = ++this.fpsMonitorGeneration;
    const poll = async () => {
      const info = await this.getFpsInfo(deviceId, packageName);
      if (generation !== this.fpsMonitorGeneration) return;
      if (info) {
        callback(info);
      }
      this.fpsInterval = setTimeout(poll, Math.max(500, interval));
    };
    void poll();
  }

  stopFpsMonitor(): void {
    this.fpsMonitorGeneration++;
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
  }

  async getPackages(deviceId: string, debuggableOnly: boolean = false): Promise<string[]> {
    try {
      const { stdout } = await runAdb(deviceId, ['shell', 'pm', 'list', 'packages']);
      const packages = stdout
        .trim()
        .split('\n')
        .map((line) => line.replace('package:', '').trim())
        .filter(Boolean)
        .sort();

      if (!debuggableOnly) {
        return packages;
      }

      const { stdout: packageDump } = await runAdb(deviceId, ['shell', 'dumpsys', 'package', 'packages']);
      const debuggable = new Set<string>();
      const starts = Array.from(packageDump.matchAll(/^\s*Package \[([^\]]+)]/gm));
      for (let index = 0; index < starts.length; index++) {
        const match = starts[index];
        const blockEnd = starts[index + 1]?.index ?? packageDump.length;
        const block = packageDump.slice(match.index, blockEnd);
        if (/\bDEBUGGABLE\b/.test(block)) debuggable.add(match[1]);
      }
      return packages.filter((packageName) => debuggable.has(packageName));
    } catch (error) {
      console.error('Error getting packages:', error);
      return [];
    }
  }

  async launchApp(deviceId: string, packageName: string): Promise<void> {
    assertPackageName(packageName);
    const launcher = ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER'];

    // Resolve the launcher activity and start it directly. monkey aborts on
    // devices without physical system keys, which includes most emulators.
    let component: string | null = null;
    try {
      const { stdout } = await runAdb(
        deviceId,
        ['shell', 'cmd', 'package', 'resolve-activity', '--brief', ...launcher, packageName],
        { timeout: 10_000 }
      );
      component = parseResolvedActivity(stdout, packageName);
    } catch {
      // Older Android without `cmd package resolve-activity`; fall back below.
    }

    if (component) {
      const { stdout, stderr } = await runAdb(deviceId, ['shell', 'am', 'start', ...launcher, '-n', component]);
      const error = parseAmStartError(`${stdout}\n${stderr}`);
      if (error) throw new Error(error);
      return;
    }

    const { stdout } = await runAdb(deviceId, [
      'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '--pct-syskeys', '0', '1',
    ]).catch((error: { stdout?: string }) => ({ stdout: error?.stdout ?? '' }));
    if (!/Events injected:\s*1/.test(stdout)) {
      throw new Error(`${packageName} has no launcher activity to start`);
    }
  }

  async killApp(deviceId: string, packageName: string): Promise<void> {
    try {
      assertPackageName(packageName);
      await runAdb(deviceId, ['shell', 'am', 'force-stop', packageName]);
    } catch (error) {
      console.error('Error killing app:', error);
      throw error;
    }
  }

  async clearAppData(deviceId: string, packageName: string): Promise<void> {
    try {
      assertPackageName(packageName);
      await runAdb(deviceId, ['shell', 'pm', 'clear', packageName]);
    } catch (error) {
      console.error('Error clearing app data:', error);
      throw error;
    }
  }

  /** Uninstalls a package for all users. Throws with adb's failure reason. */
  async uninstallApp(deviceId: string, packageName: string): Promise<void> {
    assertPackageName(packageName);
    let output: string;
    try {
      const { stdout, stderr } = await runAdb(deviceId, ['uninstall', packageName], { timeout: 60_000 });
      output = `${stdout}\n${stderr}`;
    } catch (error) {
      const { stdout = '', stderr = '' } = (error ?? {}) as { stdout?: string; stderr?: string };
      output = `${stdout}\n${stderr}`;
      if (!output.trim()) throw error;
    }
    if (/^\s*Success\s*$/m.test(output)) return;
    const failure = output.match(/Failure\s*\[([^\]]+)\]/)?.[1] ?? output.trim().split('\n').pop()?.trim();
    throw new Error(failure ? `Uninstall failed: ${failure}` : 'Uninstall failed');
  }

  /** Sends one or more key events in a single `input keyevent` call (so double taps stay fast). */
  async sendKeyEvents(deviceId: string, keyCodes: number[]): Promise<void> {
    if (keyCodes.length === 0 || keyCodes.some((code) => !Number.isInteger(code) || code < 0 || code > 400)) {
      throw new Error('Invalid key code');
    }
    await runAdb(deviceId, ['shell', 'input', 'keyevent', ...keyCodes.map(String)], { timeout: 10_000 });
  }

  /**
   * Presses one key by code (e.g. 4) or name ("BACK" / "KEYCODE_BACK"; see
   * android-keys.ts). `longPress` holds it (e.g. power menu).
   */
  async pressKey(deviceId: string, key: number | string, longPress = false): Promise<void> {
    let code: number | null;
    if (typeof key === 'number') {
      code = Number.isInteger(key) && key >= 0 && key <= 400 ? key : null;
      if (code === null) throw new Error('Invalid key code');
    } else {
      // "5" is the digit key; "66" is a raw key code.
      code = /^\d{2,3}$/.test(key.trim()) ? Number(key.trim()) : androidKeyCode(key);
      if (code === null || code > 400) {
        throw new Error(`Unknown key "${key}". Use a name such as ${ANDROID_KEY_NAMES.slice(0, 12).join(', ')}, or a numeric key code.`);
      }
    }
    await runAdb(
      deviceId,
      ['shell', 'input', 'keyevent', ...(longPress ? ['--longpress'] : []), String(code)],
      { timeout: 10_000 }
    );
  }

  async inputTap(deviceId: string, x: number, y: number): Promise<void> {
    const coords = [x, y].map((value) => Math.round(value));
    if (coords.some((value) => !Number.isFinite(value) || value < 0 || value > 100_000)) throw new Error('Invalid tap coordinates');
    await runAdb(deviceId, ['shell', 'input', 'tap', ...coords.map(String)], { timeout: 10_000 });
  }

  async inputSwipe(deviceId: string, x1: number, y1: number, x2: number, y2: number, durationMs = 300): Promise<void> {
    const coords = [x1, y1, x2, y2].map((value) => Math.round(value));
    if (coords.some((value) => !Number.isFinite(value) || value < 0 || value > 100_000)) throw new Error('Invalid swipe coordinates');
    const duration = Math.min(Math.max(Math.round(durationMs), 1), 10_000);
    await runAdb(deviceId, ['shell', 'input', 'swipe', ...coords.map(String), String(duration)], {
      timeout: 15_000 + duration,
    });
  }

  /**
   * Types text into the focused field. `input text` treats "%s" as a space and
   * can't type raw spaces, so spaces are encoded; the whole string is
   * single-quoted for the device shell.
   */
  async inputText(deviceId: string, text: string): Promise<void> {
    if (!text) throw new Error('Text is empty');
    if (/[\r\n]/.test(text)) throw new Error('Text cannot contain line breaks; send ENTER with press_key instead');
    // Only printable ASCII is supported by `input text`.
    if (/[^\x20-\x7e]/.test(text)) throw new Error('Only plain ASCII text can be typed through adb');
    // Android's `input text` has no escape for a literal "%s"; everything else types as-is.
    const encoded = text.replace(/ /g, '%s');
    await runAdb(deviceId, ['shell', 'input', 'text', `'${encoded.replace(/'/g, `'\\''`)}'`], { timeout: 20_000 });
  }

  /**
   * Runs a command in the device shell (`adb shell <command>`), returning its
   * output and exit code instead of throwing on failure.
   */
  async runShell(
    deviceId: string,
    command: string,
    timeoutMs = DEFAULT_ADB_TIMEOUT_MS
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
    assertDeviceId(deviceId);
    if (!command.trim()) throw new Error('Command is empty');
    try {
      const { stdout, stderr } = await runAdb(deviceId, ['shell', command], { timeout: timeoutMs });
      return { stdout, stderr, exitCode: 0, timedOut: false };
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean; signal?: string };
      if (failure.stdout === undefined && failure.stderr === undefined) throw error;
      return {
        stdout: String(failure.stdout ?? ''),
        stderr: String(failure.stderr ?? ''),
        exitCode: typeof failure.code === 'number' ? failure.code : null,
        timedOut: Boolean(failure.killed && failure.signal),
      };
    }
  }

  /** The last `maxLines` lines of the device's crash buffer (`logcat -b crash`). */
  async dumpCrashBuffer(deviceId: string, maxLines = 400): Promise<string> {
    const lines = Math.min(Math.max(Math.floor(maxLines), 1), 5000);
    const { stdout } = await runAdb(deviceId, ['logcat', '-d', '-b', 'crash', '-v', 'time', '-t', String(lines)]);
    return stdout;
  }

  /**
   * Streams a PNG screenshot straight to `localPath` (no temp file on the
   * device). Unlike takeScreenshot, errors are thrown with adb's reason.
   */
  async captureScreenshotTo(deviceId: string, localPath: string): Promise<{ path: string; bytes: number }> {
    const { stdout, stderr } = await runAdbBuffer(deviceId, ['exec-out', 'screencap', '-p']);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    if (stdout.length < 8 || !stdout.subarray(0, 4).equals(pngSignature)) {
      const reason = stderr.toString('utf8').trim() || stdout.toString('utf8').trim();
      throw new Error(reason ? `Screenshot failed: ${reason}` : 'The device returned an empty screenshot');
    }
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    await fs.promises.writeFile(localPath, stdout);
    return { path: localPath, bytes: stdout.length };
  }

  // ==================== App Metadata ====================

  async getAppMetadata(deviceId: string, packageName: string): Promise<AppMetadata | null> {
    try {
      assertPackageName(packageName);
      const { stdout } = await runAdb(deviceId, ['shell', 'dumpsys', 'package', packageName]);
      const metadata = parseAppMetadata(packageName, stdout);

      const codePath = stdout.match(/^\s*codePath=(.+)$/m)?.[1]?.trim();
      const parseDu = (value: string) => (parseInt(value.trim().split(/\s+/)[0], 10) || 0) * 1024;
      const [apk, data, cache] = await Promise.all([
        codePath
          ? runAdb(deviceId, ['shell', 'du', '-sk', shellQuote(codePath)]).then((result) => parseDu(result.stdout)).catch(() => 0)
          : Promise.resolve(0),
        runAdb(deviceId, ['shell', 'run-as', packageName, 'du', '-sk', `/data/data/${packageName}`])
          .then((result) => parseDu(result.stdout)).catch(() => 0),
        runAdb(deviceId, ['shell', 'run-as', packageName, 'du', '-sk', `/data/data/${packageName}/cache`])
          .then((result) => parseDu(result.stdout)).catch(() => 0),
      ]);
      return { ...metadata, apkSize: apk, dataSize: data, cacheSize: cache };
    } catch (error) {
      console.error('Error getting app metadata:', error);
      return null;
    }
  }

  // ==================== Screenshot & Screen Recording ====================

  private recordingProcess: ChildProcess | null = null;
  private recordingPath: string | null = null;
  private recordingDeviceId: string | null = null;
  private recordingStartedAt: number | null = null;
  private recordingCompletion: Promise<{ success: boolean; path?: string }> | null = null;
  private resolveRecordingCompletion: ((result: { success: boolean; path?: string }) => void) | null = null;
  private recordingStateCallback: ((state: RecordingState) => void) | null = null;
  private recordingFinalizing = false;

  async takeScreenshot(deviceId: string, outputPath?: string): Promise<ScreenshotResult | null> {
    try {
      const timestamp = Date.now();
      const remotePath = '/sdcard/screenshot.png';
      const localPath = outputPath || path.join(os.tmpdir(), `screenshot_${timestamp}.png`);

      // Take screenshot on device
      await runAdb(deviceId, ['shell', 'screencap', '-p', remotePath]);

      // Pull to local machine
      await runAdb(deviceId, ['pull', remotePath, localPath]);

      // Clean up remote file
      await runAdb(deviceId, ['shell', 'rm', remotePath]);

      return {
        path: localPath,
        width: 0, // Would need to parse image to get dimensions
        height: 0,
        timestamp,
      };
    } catch (error) {
      console.error('Error taking screenshot:', error);
      return null;
    }
  }

  async startScreenRecording(
    deviceId: string,
    outputPath?: string,
    onStateChange?: (state: RecordingState) => void
  ): Promise<{ success: boolean; path?: string }> {
    try {
      assertDeviceId(deviceId);
      if (this.recordingProcess) {
        return { success: false };
      }

      const timestamp = Date.now();
      const remotePath = '/sdcard/screenrecord.mp4';
      this.recordingPath = outputPath || path.join(os.tmpdir(), `recording_${timestamp}.mp4`);
      this.recordingDeviceId = deviceId;
      this.recordingStartedAt = timestamp;
      this.recordingStateCallback = onStateChange || null;
      this.recordingFinalizing = false;
      this.recordingCompletion = new Promise((resolve) => {
        this.resolveRecordingCompletion = resolve;
      });

      // Start recording (max 3 minutes by default)
      const process = spawn('adb', [
        '-s', deviceId,
        'shell', 'screenrecord',
        '--time-limit', '180',
        remotePath,
      ]);
      this.recordingProcess = process;

      process.on('error', (error) => {
        console.error('Screen recording process error:', error);
        if (this.recordingProcess === process) void this.finalizeScreenRecording(remotePath);
      });

      process.on('close', () => {
        if (this.recordingProcess !== process) return;
        void this.finalizeScreenRecording(remotePath);
      });

      onStateChange?.({
        isRecording: true,
        deviceId,
        startTime: timestamp,
        outputPath: this.recordingPath,
      });
      return { success: true, path: this.recordingPath };
    } catch (error) {
      console.error('Error starting screen recording:', error);
      const callback = this.recordingStateCallback;
      const resolve = this.resolveRecordingCompletion;
      this.resetRecordingState();
      callback?.({ isRecording: false });
      resolve?.({ success: false });
      return { success: false };
    }
  }

  async stopScreenRecording(deviceId: string): Promise<{ success: boolean; path?: string }> {
    try {
      if (!this.recordingProcess || !this.recordingCompletion) {
        return { success: false };
      }
      if (this.recordingDeviceId !== deviceId) {
        return { success: false };
      }

      // Send interrupt to stop recording
      const process = this.recordingProcess;
      process.kill('SIGINT');
      setTimeout(() => {
        if (this.recordingProcess === process && !this.recordingFinalizing) process.kill('SIGKILL');
      }, 10_000).unref();
      return await this.recordingCompletion;
    } catch (error) {
      console.error('Error stopping screen recording:', error);
      return { success: false };
    }
  }

  getRecordingState(): RecordingState {
    return {
      isRecording: this.recordingProcess !== null,
      deviceId: this.recordingDeviceId || undefined,
      startTime: this.recordingStartedAt || undefined,
      outputPath: this.recordingPath || undefined,
    };
  }

  private async finalizeScreenRecording(remotePath: string): Promise<void> {
    if (this.recordingFinalizing) return;
    this.recordingFinalizing = true;
    const deviceId = this.recordingDeviceId;
    const localPath = this.recordingPath;
    let result: { success: boolean; path?: string } = { success: false };

    try {
      if (deviceId && localPath) {
        await runAdb(deviceId, ['pull', remotePath, localPath], { timeout: NO_TIMEOUT });
        await runAdb(deviceId, ['shell', 'rm', remotePath]).catch(() => undefined);
        result = { success: true, path: localPath };
      }
    } catch (error) {
      console.error('Error finalizing screen recording:', error);
    }

    const callback = this.recordingStateCallback;
    const resolve = this.resolveRecordingCompletion;
    this.resetRecordingState();
    callback?.({ isRecording: false, outputPath: result.path });
    resolve?.(result);
  }

  private resetRecordingState(): void {
    this.recordingProcess = null;
    this.recordingPath = null;
    this.recordingDeviceId = null;
    this.recordingStartedAt = null;
    this.recordingCompletion = null;
    this.resolveRecordingCompletion = null;
    this.recordingStateCallback = null;
    this.recordingFinalizing = false;
  }

  // ==================== Developer Options ====================

  async getDeveloperOptions(deviceId: string): Promise<DeveloperOptions | null> {
    try {
      const [layoutBounds, gpuOverdraw, windowAnim, transitionAnim, animatorAnim, showTouches, pointerLocation] =
        await Promise.all([
          runAdb(deviceId, ['shell', 'getprop', 'debug.layout']).catch(() => ({ stdout: '' } as CommandResult)),
          runAdb(deviceId, ['shell', 'getprop', 'debug.hwui.overdraw']).catch(() => ({ stdout: '' } as CommandResult)),
          runAdb(deviceId, ['shell', 'settings', 'get', 'global', 'window_animation_scale']).catch(() => ({ stdout: '1.0' } as CommandResult)),
          runAdb(deviceId, ['shell', 'settings', 'get', 'global', 'transition_animation_scale']).catch(() => ({ stdout: '1.0' } as CommandResult)),
          runAdb(deviceId, ['shell', 'settings', 'get', 'global', 'animator_duration_scale']).catch(() => ({ stdout: '1.0' } as CommandResult)),
          runAdb(deviceId, ['shell', 'settings', 'get', 'system', 'show_touches']).catch(() => ({ stdout: '0' } as CommandResult)),
          runAdb(deviceId, ['shell', 'settings', 'get', 'system', 'pointer_location']).catch(() => ({ stdout: '0' } as CommandResult)),
        ]);

      // 0 is a valid scale (animations off); only unset ("null") means default 1x.
      const scale = (value: string) => {
        const parsed = parseFloat(value.trim());
        return Number.isFinite(parsed) ? parsed : 1.0;
      };
      const overdraw = gpuOverdraw.stdout.trim();
      return {
        layoutBounds: layoutBounds.stdout.trim() === 'true',
        // setGpuOverdraw('off') writes "false"; anything unrecognised is off.
        gpuOverdraw: overdraw === 'show' || overdraw === 'show_deuteranomaly' ? overdraw : 'off',
        windowAnimationScale: scale(windowAnim.stdout),
        transitionAnimationScale: scale(transitionAnim.stdout),
        animatorDurationScale: scale(animatorAnim.stdout),
        showTouches: showTouches.stdout.trim() === '1',
        pointerLocation: pointerLocation.stdout.trim() === '1',
      };
    } catch (error) {
      console.error('Error getting developer options:', error);
      return null;
    }
  }

  async setLayoutBounds(deviceId: string, enabled: boolean): Promise<boolean> {
    try {
      await runAdb(deviceId, ['shell', 'setprop', 'debug.layout', String(enabled)]);
      // Need to restart UI to take effect
      await runAdb(deviceId, ['shell', 'service', 'call', 'activity', '1599295570']);
      return true;
    } catch (error) {
      console.error('Error setting layout bounds:', error);
      return false;
    }
  }

  async setGpuOverdraw(deviceId: string, mode: DeveloperOptions['gpuOverdraw']): Promise<boolean> {
    try {
      const value = mode === 'show' || mode === 'show_deuteranomaly' ? mode : 'false';
      await runAdb(deviceId, ['shell', 'setprop', 'debug.hwui.overdraw', value]);
      // Need to restart UI to take effect
      await runAdb(deviceId, ['shell', 'service', 'call', 'activity', '1599295570']);
      return true;
    } catch (error) {
      console.error('Error setting GPU overdraw:', error);
      return false;
    }
  }

  async setAnimationScale(
    deviceId: string,
    scale: number,
    type: 'window' | 'transition' | 'animator'
  ): Promise<boolean> {
    try {
      const settingName = {
        window: 'window_animation_scale',
        transition: 'transition_animation_scale',
        animator: 'animator_duration_scale',
      }[type];

      if (!settingName || !Number.isFinite(scale) || scale < 0) return false;
      await runAdb(deviceId, ['shell', 'settings', 'put', 'global', settingName, String(scale)]);
      return true;
    } catch (error) {
      console.error('Error setting animation scale:', error);
      return false;
    }
  }

  async setShowTouches(deviceId: string, enabled: boolean): Promise<boolean> {
    try {
      await runAdb(deviceId, ['shell', 'settings', 'put', 'system', 'show_touches', enabled ? '1' : '0']);
      return true;
    } catch (error) {
      console.error('Error setting show touches:', error);
      return false;
    }
  }

  async setPointerLocation(deviceId: string, enabled: boolean): Promise<boolean> {
    try {
      await runAdb(deviceId, ['shell', 'settings', 'put', 'system', 'pointer_location', enabled ? '1' : '0']);
      return true;
    } catch (error) {
      console.error('Error setting pointer location:', error);
      return false;
    }
  }

  // ==================== File Inspector ====================

  async listAppFiles(deviceId: string, packageName: string, relativePath: string = ''): Promise<FileEntry[]> {
    try {
      assertPackageName(packageName);
      if (path.posix.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
        throw new Error('Invalid app-relative path');
      }
      const basePath = `/data/data/${packageName}`;
      const fullPath = relativePath ? `${basePath}/${relativePath}` : basePath;

      const { stdout } = await runAdb(deviceId, [
        'shell', 'run-as', packageName, 'ls', '-la', shellQuote(fullPath),
      ]);

      const entries: FileEntry[] = parseLsEntries(stdout, relativePath);
      return entries;
    } catch (error) {
      console.error('Error listing app files:', error);
      return [];
    }
  }

  async readAppFile(deviceId: string, packageName: string, relativePath: string): Promise<string | null> {
    try {
      assertPackageName(packageName);
      if (!relativePath || path.posix.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
        throw new Error('Invalid app-relative path');
      }
      const basePath = `/data/data/${packageName}`;
      const fullPath = `${basePath}/${relativePath}`;

      const { stdout } = await runAdb(deviceId, [
        'shell', 'run-as', packageName, 'cat', shellQuote(fullPath),
      ]);

      return stdout;
    } catch (error) {
      console.error('Error reading app file:', error);
      return null;
    }
  }

  async readSharedPreferences(deviceId: string, packageName: string): Promise<SharedPreference[]> {
    try {
      // List shared_prefs directory
      const files = await this.listAppFiles(deviceId, packageName, 'shared_prefs');
      const prefs: SharedPreference[] = [];

      for (const file of files) {
        if (file.type === 'file' && file.name.endsWith('.xml')) {
          const content = await this.readAppFile(deviceId, packageName, `shared_prefs/${file.name}`);
          if (content) {
            const entries = parseSharedPrefsXml(content);
            prefs.push({
              file: file.name,
              entries,
            });
          }
        }
      }

      return prefs;
    } catch (error) {
      console.error('Error reading shared preferences:', error);
      return [];
    }
  }

  async listDatabases(deviceId: string, packageName: string): Promise<DatabaseInfo[]> {
    try {
      const files = await this.listAppFiles(deviceId, packageName, 'databases');
      const databases: DatabaseInfo[] = [];

      for (const file of files) {
        if (file.type === 'file' && !file.name.endsWith('-journal') && !file.name.endsWith('-wal') && !file.name.endsWith('-shm')) {
          // Get tables for this database
          const tables = await this.getDatabaseTables(deviceId, packageName, file.name);
          databases.push({
            name: file.name,
            path: `databases/${file.name}`,
            tables,
            size: file.size,
          });
        }
      }

      return databases;
    } catch (error) {
      console.error('Error listing databases:', error);
      return [];
    }
  }

  private async getDatabaseTables(deviceId: string, packageName: string, dbName: string): Promise<string[]> {
    try {
      const result = await this.withLocalDatabase(deviceId, packageName, dbName, async (localPath) => {
        const { stdout } = await runCommand('/usr/bin/sqlite3', [
          '-readonly', '-json', localPath,
          "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
        ]);
        const rows = JSON.parse(stdout || '[]') as Array<{ name: string }>;
        return rows.map((row) => row.name);
      });
      return result;
    } catch (error) {
      console.error('Error getting database tables:', error);
      return [];
    }
  }

  async queryDatabase(
    deviceId: string,
    packageName: string,
    dbName: string,
    query: string
  ): Promise<DatabaseQueryResult | null> {
    try {
      if (!query.trim()) {
        return { columns: [], rows: [], rowCount: 0 };
      }

      return await this.withLocalDatabase(deviceId, packageName, dbName, async (localPath) => {
        const { stdout } = await runCommand('/usr/bin/sqlite3', [
          '-readonly', '-json', localPath, query,
        ]);
        const records = JSON.parse(stdout || '[]') as Array<Record<string, unknown>>;
        const columns = records.length > 0 ? Object.keys(records[0]) : [];
        return {
          columns,
          rows: records.map((record) => columns.map((column) => record[column])),
          rowCount: records.length,
        };
      });
    } catch (error) {
      console.error('Error querying database:', error);
      return null;
    }
  }

  private async withLocalDatabase<T>(
    deviceId: string,
    packageName: string,
    dbName: string,
    operation: (localPath: string) => Promise<T>
  ): Promise<T> {
    assertPackageName(packageName);
    if (!dbName || path.basename(dbName) !== dbName || dbName.includes('..')) {
      throw new Error('Invalid database name');
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-debugger-db-'));
    const localPath = path.join(tempDir, dbName);
    const remotePath = `/data/data/${packageName}/databases/${dbName}`;

    try {
      const database = await runAdbBuffer(deviceId, [
        'exec-out', 'run-as', packageName, 'cat', shellQuote(remotePath),
      ], { timeout: NO_TIMEOUT });
      fs.writeFileSync(localPath, database.stdout);

      for (const suffix of ['-wal', '-shm']) {
        try {
          const sidecar = await runAdbBuffer(deviceId, [
            'exec-out', 'run-as', packageName, 'cat', shellQuote(`${remotePath}${suffix}`),
          ], { timeout: NO_TIMEOUT });
          if (sidecar.stdout.length > 0) {
            fs.writeFileSync(`${localPath}${suffix}`, sidecar.stdout);
          }
        } catch {
          // Sidecar files are optional.
        }
      }

      return await operation(localPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ==================== Intent Tester ====================

  async fireIntent(deviceId: string, intent: IntentConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const args = ['shell', 'am', 'start'];

      // Action
      if (intent.action) {
        args.push('-a', shellQuote(intent.action));
      }

      // Data URI
      if (intent.data) {
        args.push('-d', shellQuote(intent.data));
      }

      // MIME type
      if (intent.type) {
        args.push('-t', shellQuote(intent.type));
      }

      // Category
      if (intent.category) {
        args.push('-c', shellQuote(intent.category));
      }

      // Component
      if (intent.component) {
        args.push('-n', shellQuote(intent.component));
      }

      // Flags
      for (const flag of intent.flags) {
        args.push('-f', shellQuote(flag));
      }

      // Extras
      for (const extra of intent.extras) {
        const typeFlag: string = {
          string: '--es',
          int: '--ei',
          long: '--el',
          float: '--ef',
          boolean: '--ez',
          uri: '--eu',
        }[extra.type];

        if (!typeFlag) continue;
        args.push(typeFlag, shellQuote(extra.key), shellQuote(extra.value));
      }

      const { stdout, stderr } = await runAdb(deviceId, args);
      const output = `${stdout}\n${stderr}`;

      if (/\b(?:Error|Exception|unable to resolve)\b/i.test(output)) {
        return { success: false, error: output.trim() };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async fireDeepLink(deviceId: string, uri: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { stdout, stderr } = await runAdb(deviceId, [
        'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', shellQuote(uri),
      ]);
      const output = `${stdout}\n${stderr}`;

      if (/\b(?:Error|Exception|unable to resolve)\b/i.test(output)) {
        return { success: false, error: output.trim() };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // ==================== Battery Monitor ====================

  async getBatteryInfo(deviceId: string): Promise<BatteryInfo | null> {
    if (!deviceId) {
      return null;
    }
    try {
      const { stdout } = await runAdb(deviceId, ['shell', 'dumpsys', 'battery']);
      return parseBatteryInfo(stdout);
    } catch (error) {
      console.error('Error getting battery info:', error);
      return null;
    }
  }

  startBatteryMonitor(
    deviceId: string,
    interval: number,
    callback: (info: BatteryInfo) => void
  ): void {
    this.stopBatteryMonitor();

    if (!deviceId) {
      return;
    }

    const generation = ++this.batteryMonitorGeneration;
    const poll = async () => {
      const info = await this.getBatteryInfo(deviceId);
      if (generation !== this.batteryMonitorGeneration) return;
      if (info) {
        callback(info);
      }
      this.batteryInterval = setTimeout(poll, Math.max(500, interval));
    };
    void poll();
  }

  stopBatteryMonitor(): void {
    this.batteryMonitorGeneration++;
    if (this.batteryInterval) {
      clearInterval(this.batteryInterval);
      this.batteryInterval = null;
    }
  }

  // ==================== Crash Logcat ====================

  startCrashLogcat(deviceId: string, callback: CrashCallback): void {
    this.stopCrashLogcat();

    if (!deviceId) {
      return;
    }
    assertDeviceId(deviceId);

    const args = ['-s', deviceId, 'logcat', '-b', 'crash', '-v', 'time'];
    const process = spawn('adb', args);
    this.crashLogcatProcess = process;
    // Decode as a stream so multi-byte UTF-8 characters split across chunks survive.
    process.stdout?.setEncoding('utf8');

    let buffer = '';
    let currentCrash: Partial<CrashEntry> | null = null;
    let flushTimer: NodeJS.Timeout | null = null;

    // A crash has no terminator line, so emit it once the stream goes quiet
    // instead of holding it until the next crash (or process exit) arrives.
    const flushCrash = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (currentCrash && currentCrash.message && this.crashLogcatProcess === process) {
        callback(this.finalizeCrashEntry(currentCrash));
      }
      currentCrash = null;
    };

    process.stdout?.on('data', (data: string) => {
      if (this.crashLogcatProcess !== process) return;
      buffer += data;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith('--------- beginning of')) continue;
        const content = this.parseLogLine(line)?.message ?? line;

        // Detect start of a crash (FATAL EXCEPTION or native signal)
        const fatalMatch = content.match(/FATAL EXCEPTION:\s*(.+)/);
        const nativeSignalMatch = content.match(/signal\s+(\d+)\s+\(([^)]+)\)/i);
        const timestampMatch = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);
        // libc's "Fatal signal" line and the tombstone's "signal N (SIG...)"
        // line describe the same native crash.
        const continuesNativeCrash = !fatalMatch && nativeSignalMatch && currentCrash?.signal === nativeSignalMatch[2];

        if ((fatalMatch || nativeSignalMatch) && !continuesNativeCrash) {
          flushCrash();

          currentCrash = {
            id: uuidv4(),
            timestamp: timestampMatch?.[1] || new Date().toISOString(),
            processName: 'Unknown',
            pid: 0,
            signal: nativeSignalMatch?.[2],
            message: content.trim(),
            stackTrace: [],
            raw: line,
          };

          // Extract PID from log line if present
          const pidMatch = line.match(/\(\s*(\d+)\):/);
          if (pidMatch) {
            currentCrash.pid = parseInt(pidMatch[1], 10);
          }
          const nativeProcess = content.match(/\bpid\s+(\d+)\s+\(([^)]+)\)/);
          if (nativeProcess) {
            currentCrash.pid = parseInt(nativeProcess[1], 10);
            currentCrash.processName = nativeProcess[2];
          }
        } else if (currentCrash) {
          // Add to current crash stack trace
          currentCrash.raw += '\n' + line;

          // Check if this looks like a stack trace line
          if (/^\s*at\s/.test(content) || /^\s*#\d+\s/.test(content) || /^\s*Caused by:/.test(content)) {
            currentCrash.stackTrace?.push(content.trim());
          } else if (currentCrash.message?.startsWith('FATAL EXCEPTION') && content.trim() && !/^\s*Process:/.test(content)) {
            // First line after the header/process line is the exception itself.
            currentCrash.message = content.trim();
          }

          // Check for process/thread info
          const processMatch = content.match(/Process:\s*([^\s,]+)/) || content.match(/>>>\s*(\S+)\s*<<</);
          if (processMatch) {
            currentCrash.processName = processMatch[1];
          }

          const pidLineMatch = content.match(/\bPID:\s*(\d+)/i);
          if (pidLineMatch) {
            currentCrash.pid = parseInt(pidLineMatch[1], 10);
          }
        }
      }

      if (currentCrash) {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flushCrash, 750);
      }
    });

    process.on('error', (error) => {
      if (this.crashLogcatProcess !== process) return;
      console.error('Crash logcat process error:', error);
    });

    process.on('close', () => {
      // Emit any remaining crash
      flushCrash();
      if (this.crashLogcatProcess === process) this.crashLogcatProcess = null;
    });

    process.stderr?.on('data', (data: Buffer) => {
      if (this.crashLogcatProcess !== process) return;
      console.error('Crash logcat error:', data.toString());
    });
  }

  private finalizeCrashEntry(partial: Partial<CrashEntry>): CrashEntry {
    return {
      id: partial.id || uuidv4(),
      timestamp: partial.timestamp || new Date().toISOString(),
      processName: partial.processName || 'Unknown',
      pid: partial.pid || 0,
      signal: partial.signal,
      message: partial.message || '',
      stackTrace: partial.stackTrace || [],
      raw: partial.raw || '',
    };
  }

  stopCrashLogcat(): void {
    if (this.crashLogcatProcess) {
      this.crashLogcatProcess.kill();
      this.crashLogcatProcess = null;
    }
  }

  async clearCrashLogcat(deviceId: string): Promise<void> {
    try {
      await runAdb(deviceId, ['logcat', '-b', 'crash', '-c']);
    } catch (error) {
      console.error('Error clearing crash logcat:', error);
    }
  }

  // ==================== Running Services ====================

  async getRunningServices(deviceId: string, packageName?: string): Promise<ServiceInfo[]> {
    try {
      if (packageName) assertPackageName(packageName);
      const args = ['shell', 'dumpsys', 'activity', 'services'];
      if (packageName) args.push(packageName);
      const { stdout } = await runAdb(deviceId, args);
      return parseServicesInfo(stdout, packageName);
    } catch (error) {
      console.error('Error getting running services:', error);
      return [];
    }
  }

  // ==================== Network Stats ====================

  async getNetworkStats(deviceId: string, packageName?: string): Promise<AppNetworkStats | null> {
    if (!deviceId) {
      return null;
    }
    try {
      // First get the UID for the package
      let uid: number | null = null;
      if (packageName) {
        assertPackageName(packageName);
        const { stdout: uidOutput } = await runAdb(deviceId, [
          'shell', 'dumpsys', 'package', packageName,
        ]);
        uid = parsePackageUid(uidOutput);
        if (uid === null) return null;
      }

      const { stdout } = await runAdb(deviceId, ['shell', 'dumpsys', 'netstats', 'detail']);
      return parseNetworkStats(stdout, packageName, uid);
    } catch (error) {
      console.error('Error getting network stats:', error);
      return null;
    }
  }

  startNetworkStatsMonitor(
    deviceId: string,
    packageName: string,
    interval: number,
    callback: (stats: AppNetworkStats) => void
  ): void {
    this.stopNetworkStatsMonitor();

    if (!deviceId || !packageName) {
      return;
    }

    const generation = ++this.networkMonitorGeneration;
    const poll = async () => {
      const stats = await this.getNetworkStats(deviceId, packageName);
      if (generation !== this.networkMonitorGeneration) return;
      if (stats) {
        callback(stats);
      }
      this.networkStatsInterval = setTimeout(poll, Math.max(500, interval));
    };
    void poll();
  }

  stopNetworkStatsMonitor(): void {
    this.networkMonitorGeneration++;
    if (this.networkStatsInterval) {
      clearInterval(this.networkStatsInterval);
      this.networkStatsInterval = null;
    }
  }

  // ==================== Activity Stack ====================

  async getActivityStack(deviceId: string, packageName: string): Promise<ActivityStackInfo | null> {
    try {
      assertPackageName(packageName);
      const { stdout } = await runAdb(deviceId, [
        'shell', 'dumpsys', 'activity', 'activities', packageName,
      ]);
      return parseActivityStack(packageName, stdout);
    } catch (error) {
      console.error('Error getting activity stack:', error);
      return null;
    }
  }

  // ==================== Job Scheduler ====================

  async getScheduledJobs(deviceId: string, packageName?: string): Promise<JobSchedulerInfo | null> {
    try {
      if (packageName) assertPackageName(packageName);
      const args = ['shell', 'dumpsys', 'jobscheduler'];
      if (packageName) args.push(packageName);
      const { stdout } = await runAdb(deviceId, args);
      return parseScheduledJobs(stdout, packageName);
    } catch (error) {
      console.error('Error getting scheduled jobs:', error);
      return null;
    }
  }

  // ==================== Alarm Monitor ====================

  async getScheduledAlarms(deviceId: string, packageName?: string): Promise<AlarmMonitorInfo | null> {
    try {
      if (packageName) assertPackageName(packageName);
      const args = ['shell', 'dumpsys', 'alarm'];
      if (packageName) args.push(packageName);
      const { stdout } = await runAdb(deviceId, args);
      return parseScheduledAlarms(stdout, packageName);
    } catch (error) {
      console.error('Error getting scheduled alarms:', error);
      return null;
    }
  }

  // ==================== App Installation ====================

  /**
   * Install an APK file to a device
   */
  async installApk(
    deviceId: string,
    apkPath: string,
    options: InstallOptions = {},
    onProgress?: (progress: InstallProgress) => void
  ): Promise<InstallResult> {
    try {
      // Validate file exists
      onProgress?.({ stage: 'validating', percent: 10, message: 'Validating APK file...' });

      if (!fs.existsSync(apkPath)) {
        return { success: false, error: 'APK file not found', errorCode: 'FILE_NOT_FOUND' };
      }

      // Build install command with flags
      const flags: string[] = [];
      if (options.reinstall) flags.push('-r');
      if (options.allowDowngrade) flags.push('-d');
      if (options.grantPermissions) flags.push('-g');

      onProgress?.({ stage: 'installing', percent: 50, message: 'Installing APK...' });

      const { stdout, stderr } = await runAdb(deviceId, ['install', ...flags, apkPath], { timeout: NO_TIMEOUT });
      const output = stdout + stderr;

      // Parse result
      if (output.includes('Success')) {
        // Try to extract package name from APK
        let packageName: string | undefined;
        try {
          const { stdout: aapt } = await runCommand('aapt2', ['dump', 'badging', apkPath], { timeout: 10000 });
          packageName = aapt.match(/^package:\s+name='([^']+)'/m)?.[1];
        } catch {
          // Ignore aapt errors
        }

        onProgress?.({ stage: 'complete', percent: 100, message: 'Installation complete!' });
        return { success: true, packageName };
      }

      // Parse error codes
      const errorCode = this.parseInstallError(output);
      const errorMessage = this.getInstallErrorMessage(errorCode, output);

      onProgress?.({ stage: 'error', percent: 100, message: errorMessage });
      return { success: false, error: errorMessage, errorCode };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ stage: 'error', percent: 100, message });
      return { success: false, error: message, errorCode: 'UNKNOWN' };
    }
  }

  /**
   * Install multiple APKs (split APKs) to a device
   */
  async installMultipleApks(
    deviceId: string,
    apkPaths: string[],
    options: InstallOptions = {},
    onProgress?: (progress: InstallProgress) => void
  ): Promise<InstallResult> {
    try {
      onProgress?.({ stage: 'validating', percent: 10, message: 'Validating APK files...' });

      // Validate all files exist
      for (const apkPath of apkPaths) {
        if (!fs.existsSync(apkPath)) {
          return { success: false, error: `APK file not found: ${apkPath}`, errorCode: 'FILE_NOT_FOUND' };
        }
      }

      // Build install-multiple command
      const flags: string[] = [];
      if (options.reinstall) flags.push('-r');
      if (options.allowDowngrade) flags.push('-d');
      if (options.grantPermissions) flags.push('-g');

      onProgress?.({ stage: 'installing', percent: 50, message: 'Installing APKs...' });

      const { stdout, stderr } = await runAdb(
        deviceId,
        ['install-multiple', ...flags, ...apkPaths],
        { timeout: NO_TIMEOUT }
      );
      const output = stdout + stderr;

      if (output.includes('Success')) {
        onProgress?.({ stage: 'complete', percent: 100, message: 'Installation complete!' });
        return { success: true };
      }

      const errorCode = this.parseInstallError(output);
      const errorMessage = this.getInstallErrorMessage(errorCode, output);

      onProgress?.({ stage: 'error', percent: 100, message: errorMessage });
      return { success: false, error: errorMessage, errorCode };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ stage: 'error', percent: 100, message });
      return { success: false, error: message, errorCode: 'UNKNOWN' };
    }
  }

  /**
   * Get device ABIs (CPU architectures)
   */
  async getDeviceAbis(deviceId: string): Promise<string[]> {
    try {
      const { stdout } = await runAdb(deviceId, ['shell', 'getprop', 'ro.product.cpu.abilist']);
      return stdout.trim().split(',').filter(Boolean);
    } catch (error) {
      console.error('Error getting device ABIs:', error);
      return [];
    }
  }

  /**
   * Get device screen density
   */
  async getDeviceScreenDensity(deviceId: string): Promise<number> {
    try {
      const { stdout } = await runAdb(deviceId, ['shell', 'getprop', 'ro.sf.lcd_density']);
      const density = parseInt(stdout.trim(), 10);
      return isNaN(density) ? 0 : density;
    } catch (error) {
      console.error('Error getting device screen density:', error);
      return 0;
    }
  }

  /**
   * Get device SDK version
   */
  async getDeviceSdkVersion(deviceId: string): Promise<number> {
    try {
      const { stdout } = await runAdb(deviceId, ['shell', 'getprop', 'ro.build.version.sdk']);
      const sdk = parseInt(stdout.trim(), 10);
      return isNaN(sdk) ? 0 : sdk;
    } catch (error) {
      console.error('Error getting device SDK version:', error);
      return 0;
    }
  }

  /**
   * Get full device spec for AAB installation
   */
  async getDeviceSpec(deviceId: string): Promise<DeviceSpec> {
    const [abis, screenDensity, sdkVersion] = await Promise.all([
      this.getDeviceAbis(deviceId),
      this.getDeviceScreenDensity(deviceId),
      this.getDeviceSdkVersion(deviceId),
    ]);

    return { abis, screenDensity, sdkVersion };
  }

  /**
   * Check if Java is available on the system
   */
  async checkJavaAvailable(): Promise<boolean> {
    try {
      await runCommand('java', ['-version'], { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the bundletool directory in userData
   */
  private getBundletoolDir(): string {
    // This will be set by the main process
    return this.bundletoolDir;
  }

  private bundletoolDir: string = '';

  /**
   * Set the bundletool directory (called from main process with app.getPath('userData'))
   */
  setBundletoolDir(dir: string): void {
    this.bundletoolDir = dir;
  }

  /**
   * Get the path to bundletool.jar
   * Checks userData directory where bundletool is downloaded on-demand
   */
  getBundletoolPath(): string {
    // Primary location: userData directory (downloaded on-demand)
    if (this.bundletoolDir) {
      const userDataPath = path.join(this.bundletoolDir, 'bundletool', 'bundletool.jar');
      if (fs.existsSync(userDataPath)) {
        return userDataPath;
      }
    }

    // Fallback: check for bundled bundletool in dev resources (for development only)
    const devPaths = [
      path.join(__dirname, '../../resources/bundletool/bundletool.jar'),
      path.join(__dirname, '../../../resources/bundletool/bundletool.jar'),
    ];

    for (const p of devPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return '';
  }

  /**
   * Check if bundletool needs to be downloaded
   */
  needsBundletoolDownload(): boolean {
    return !this.getBundletoolPath();
  }

  /**
   * Download bundletool to userData directory
   */
  async downloadBundletool(onProgress?: (percent: number, message: string) => void): Promise<{ success: boolean; error?: string }> {
    const BUNDLETOOL_VERSION = '1.17.2';
    const BUNDLETOOL_URL = `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`;

    if (!this.bundletoolDir) {
      return { success: false, error: 'Bundletool directory not set' };
    }

    const bundletoolDir = path.join(this.bundletoolDir, 'bundletool');
    const bundletoolPath = path.join(bundletoolDir, 'bundletool.jar');

    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(bundletoolDir)) {
        fs.mkdirSync(bundletoolDir, { recursive: true });
      }

      onProgress?.(10, 'Starting download...');

      // Download using curl (available on macOS)
      await runCommand('curl', ['--fail', '--location', '--output', bundletoolPath, BUNDLETOOL_URL], { timeout: 300000 });

      onProgress?.(90, 'Verifying download...');

      // Verify the file exists and has reasonable size
      if (!fs.existsSync(bundletoolPath)) {
        return { success: false, error: 'Download failed - file not found' };
      }

      const stats = fs.statSync(bundletoolPath);
      if (stats.size < 1000000) { // Should be at least 1MB
        fs.unlinkSync(bundletoolPath);
        return { success: false, error: 'Download failed - file too small' };
      }

      const { createHash } = await import('crypto');
      const digest = createHash('sha256').update(fs.readFileSync(bundletoolPath)).digest('hex');
      if (digest !== '2d4ad908faea64047c1cc9cb747e6aa667c6ab192e09607bd16b67246a8cd6ae') {
        fs.unlinkSync(bundletoolPath);
        return { success: false, error: 'Bundletool download failed integrity verification' };
      }

      onProgress?.(100, 'Download complete');
      return { success: true };
    } catch (error) {
      // Clean up partial download
      try {
        if (fs.existsSync(bundletoolPath)) {
          fs.unlinkSync(bundletoolPath);
        }
      } catch {
        // Ignore cleanup errors
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Install an AAB file using bundletool
   */
  async installAab(
    deviceId: string,
    aabPath: string,
    options: InstallOptions = {},
    onProgress?: (progress: InstallProgress) => void
  ): Promise<InstallResult> {
    try {
      // Check Java availability
      onProgress?.({ stage: 'validating', percent: 5, message: 'Checking Java availability...' });

      const javaAvailable = await this.checkJavaAvailable();
      if (!javaAvailable) {
        return {
          success: false,
          error: 'Java is required for AAB files. Install Java or use APK format.',
          errorCode: 'JAVA_NOT_FOUND',
        };
      }

      // Validate file exists
      onProgress?.({ stage: 'validating', percent: 10, message: 'Validating AAB file...' });

      if (!fs.existsSync(aabPath)) {
        return { success: false, error: 'AAB file not found', errorCode: 'FILE_NOT_FOUND' };
      }

      // Find bundletool
      const bundletoolPath = this.getBundletoolPath();
      if (!bundletoolPath) {
        return {
          success: false,
          error: 'Bundletool not found. Please ensure bundletool.jar is available.',
          errorCode: 'BUNDLETOOL_NOT_FOUND',
        };
      }

      // Create temp directory for APKs
      const tempDir = path.join(os.tmpdir(), `aab-install-${Date.now()}`);
      const apksPath = path.join(tempDir, 'output.apks');
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        // Build APKs using bundletool
        // Sign with debug keystore for local installation
        onProgress?.({ stage: 'extracting', percent: 30, message: 'Building APKs from AAB...' });

        // Find or create the debug keystore (standard Android location)
        const homeDir = os.homedir();
        const androidDir = path.join(homeDir, '.android');
        const debugKeystorePath = path.join(androidDir, 'debug.keystore');

        // Create .android directory if it doesn't exist
        if (!fs.existsSync(androidDir)) {
          fs.mkdirSync(androidDir, { recursive: true });
        }

        // Create debug keystore if it doesn't exist
        if (!fs.existsSync(debugKeystorePath)) {
          onProgress?.({ stage: 'extracting', percent: 20, message: 'Creating debug keystore...' });
          try {
            await runCommand(
              'keytool',
              ['-genkey', '-v', '-keystore', debugKeystorePath, '-storepass', 'android', '-alias', 'androiddebugkey', '-keypass', 'android', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US'],
              { timeout: 30000 }
            );
          } catch (e) {
            console.error('Failed to create debug keystore:', e);
            // Continue without keystore - let bundletool handle it
          }
        }

        const buildArgs = [
          '-jar', bundletoolPath, 'build-apks',
          `--bundle=${aabPath}`,
          `--output=${apksPath}`,
          '--connected-device',
          `--device-id=${deviceId}`,
          '--local-testing',
        ];

        // Use debug keystore for signing (required for installation)
        if (fs.existsSync(debugKeystorePath)) {
          buildArgs.push(
            `--ks=${debugKeystorePath}`,
            '--ks-pass=pass:android',
            '--ks-key-alias=androiddebugkey',
            '--key-pass=pass:android'
          );
        }

        await runCommand('java', buildArgs, { timeout: 300000 });

        // Extract the APKs from the .apks archive and install via ADB directly
        // This is more reliable than bundletool install-apks for debug builds
        onProgress?.({ stage: 'installing', percent: 60, message: 'Extracting APKs...' });

        const extractDir = path.join(tempDir, 'extracted');
        fs.mkdirSync(extractDir, { recursive: true });

        // Unzip the .apks file (it's a ZIP archive)
        await runCommand('unzip', ['-o', apksPath, '-d', extractDir], { timeout: 60000 });

        // Find all APK files
        const apkFiles: string[] = [];
        const findApks = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              findApks(fullPath);
            } else if (entry.name.endsWith('.apk')) {
              apkFiles.push(fullPath);
            }
          }
        };
        findApks(extractDir);

        if (apkFiles.length === 0) {
          onProgress?.({ stage: 'error', percent: 100, message: 'No APK files found in AAB' });
          return { success: false, error: 'No APK files found in AAB', errorCode: 'NO_APKS_FOUND' };
        }

        onProgress?.({ stage: 'installing', percent: 80, message: `Installing ${apkFiles.length} APK(s)...` });

        // Install using adb install-multiple for split APKs
        if (apkFiles.length === 1) {
          // Single APK - use regular install
          return await this.installApk(deviceId, apkFiles[0], options, onProgress);
        } else {
          // Multiple APKs - use install-multiple
          return await this.installMultipleApks(deviceId, apkFiles, options, onProgress);
        }
      } finally {
        // Clean up temp directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ stage: 'error', percent: 100, message });
      return { success: false, error: message, errorCode: 'UNKNOWN' };
    }
  }

  /**
   * Parse install error code from ADB output
   */
  private parseInstallError(output: string): string {
    const errorPatterns = [
      'INSTALL_FAILED_ALREADY_EXISTS',
      'INSTALL_FAILED_VERSION_DOWNGRADE',
      'INSTALL_FAILED_INSUFFICIENT_STORAGE',
      'INSTALL_FAILED_INVALID_APK',
      'INSTALL_FAILED_UPDATE_INCOMPATIBLE',
      'INSTALL_FAILED_OLDER_SDK',
      'INSTALL_FAILED_CONFLICTING_PROVIDER',
      'INSTALL_FAILED_NEWER_SDK',
      'INSTALL_FAILED_TEST_ONLY',
      'INSTALL_FAILED_CPU_ABI_INCOMPATIBLE',
      'INSTALL_FAILED_MISSING_SHARED_LIBRARY',
      'INSTALL_FAILED_NO_MATCHING_ABIS',
      'INSTALL_FAILED_VERIFICATION_FAILURE',
      'INSTALL_PARSE_FAILED_NO_CERTIFICATES',
      'INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES',
      'INSTALL_FAILED_USER_RESTRICTED',
    ];

    for (const pattern of errorPatterns) {
      if (output.includes(pattern)) {
        return pattern;
      }
    }

    return 'UNKNOWN';
  }

  /**
   * Get user-friendly error message from error code
   */
  private getInstallErrorMessage(errorCode: string, rawOutput?: string): string {
    const messages: Record<string, string> = {
      'INSTALL_FAILED_ALREADY_EXISTS': 'App already installed. Enable "Reinstall" option.',
      'INSTALL_FAILED_VERSION_DOWNGRADE': 'Cannot install older version. Enable "Allow downgrade" option.',
      'INSTALL_FAILED_INSUFFICIENT_STORAGE': 'Not enough storage space on device.',
      'INSTALL_FAILED_INVALID_APK': 'Invalid APK file. File may be corrupted.',
      'INSTALL_FAILED_UPDATE_INCOMPATIBLE': 'Incompatible update. Uninstall existing app first.',
      'INSTALL_FAILED_OLDER_SDK': 'App requires newer Android version.',
      'INSTALL_FAILED_CONFLICTING_PROVIDER': 'Conflicting content provider. Uninstall conflicting app.',
      'INSTALL_FAILED_NEWER_SDK': 'App not compatible with device Android version.',
      'INSTALL_FAILED_TEST_ONLY': 'Test-only APK cannot be installed.',
      'INSTALL_FAILED_CPU_ABI_INCOMPATIBLE': 'APK not compatible with device CPU architecture.',
      'INSTALL_FAILED_MISSING_SHARED_LIBRARY': 'Missing required shared library.',
      'INSTALL_FAILED_NO_MATCHING_ABIS': 'No matching native libraries for device architecture.',
      'INSTALL_FAILED_VERIFICATION_FAILURE': 'Package verification failed.',
      'INSTALL_PARSE_FAILED_NO_CERTIFICATES': 'APK is not signed.',
      'INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES': 'APK signature does not match installed version.',
      'INSTALL_FAILED_USER_RESTRICTED': 'Installation blocked by user restrictions.',
      'JAVA_NOT_FOUND': 'Java is required for AAB files. Install Java or use APK format.',
      'BUNDLETOOL_NOT_FOUND': 'Bundletool not found. Please ensure bundletool.jar is available.',
      'FILE_NOT_FOUND': 'File not found.',
    };

    return messages[errorCode] || rawOutput?.substring(0, 200) || 'Installation failed.';
  }

  // ==================== Thread Monitor ====================

  async getThreads(deviceId: string, packageName: string): Promise<ThreadSnapshot | null> {
    if (!deviceId || !packageName) {
      return null;
    }

    try {
      const pid = await this.getPid(deviceId, packageName);
      if (!pid) {
        return null;
      }
      return await this.readThreadSnapshot(deviceId, pid);
    } catch (error) {
      console.error('Error getting threads:', error);
      return null;
    }
  }

  /** Snapshot a process's threads, or null if it has none (it exited). */
  private async readThreadSnapshot(deviceId: string, pid: number): Promise<ThreadSnapshot | null> {
    // Read every thread's stat in one adb round-trip instead of two adb
    // processes per thread. The stat line already carries the thread name
    // (same 15-char value as /proc/.../comm). Threads can exit between the
    // glob expansion and the read, so ignore cat's errors.
    const { stdout: statOutput } = await runAdb(deviceId, [
      'shell', `cat /proc/${pid}/task/*/stat 2>/dev/null; true`,
    ]);

    const threadResults = statOutput.split('\n').map((line): ThreadInfo | null => {
      const stat = line.trim();
      const tid = parseInt(stat, 10);
      return stat && Number.isFinite(tid) ? this.parseThreadStat(tid, stat, '') : null;
    });
    const threads = threadResults.filter((thread): thread is ThreadInfo => thread !== null);
    if (threads.length === 0) return null;

    return {
      timestamp: Date.now(),
      threads,
    };
  }

  private parseThreadStat(tid: number, stat: string, comm: string): ThreadInfo | null {
    try {
      // /proc/[pid]/task/[tid]/stat format:
      // pid (comm) state ppid pgrp session tty_nr tpgid flags minflt cminflt majflt cmajflt utime stime...
      const match = stat.match(/^\d+\s+\((.*)\)\s+(\S)\s+.+/);
      if (!match) return null;

      const name = comm || match[1];
      const stateChar = match[2];

      // Parse state character
      const stateMap: Record<string, ThreadState> = {
        'R': 'running',
        'S': 'sleeping',
        'D': 'waiting',  // Disk sleep (uninterruptible)
        'Z': 'zombie',
        'T': 'stopped',
        't': 'stopped',  // Tracing stop
        'W': 'waiting',  // Paging
        'X': 'zombie',   // Dead
        'x': 'zombie',
        'K': 'waiting',  // Wakekill
        'P': 'waiting',  // Parked
      };

      const state = stateMap[stateChar] || 'unknown';

      // Parse CPU time from stat fields (utime + stime are fields 14 and 15, 1-indexed)
      const closingParen = stat.lastIndexOf(')');
      const fields = stat.slice(closingParen + 2).split(/\s+/);
      const utime = parseInt(fields[11], 10) || 0;  // User mode jiffies
      const stime = parseInt(fields[12], 10) || 0;  // Kernel mode jiffies
      const cpuTime = (utime + stime) / 100;  // Convert jiffies to seconds (approximate)

      const priority = parseInt(fields[15], 10) || 0;

      return {
        id: tid,
        name,
        state,
        cpuTime,
        priority,
      };
    } catch {
      return null;
    }
  }

  startThreadMonitor(
    deviceId: string,
    packageName: string,
    interval: number,
    callback: ThreadCallback
  ): void {
    this.stopThreadMonitor();

    if (!deviceId || !packageName) {
      return;
    }

    const generation = ++this.threadMonitorGeneration;
    // Reuse the PID between polls (one adb call per poll instead of two) and
    // look it up again when the process is gone or every few polls, which
    // also guards against the PID being recycled after an app restart.
    let pid: number | null = null;
    let pollsSinceLookup = 0;
    const poll = async () => {
      let snapshot: ThreadSnapshot | null = null;
      try {
        if (pid && pollsSinceLookup < 10) {
          pollsSinceLookup++;
          snapshot = await this.readThreadSnapshot(deviceId, pid);
        }
        if (!snapshot && generation === this.threadMonitorGeneration) {
          pid = await this.getPid(deviceId, packageName);
          pollsSinceLookup = 0;
          if (pid && generation === this.threadMonitorGeneration) {
            snapshot = await this.readThreadSnapshot(deviceId, pid);
          }
        }
      } catch (error) {
        console.error('Error getting threads:', error);
        pid = null;
      }
      if (generation !== this.threadMonitorGeneration) return;
      if (snapshot) {
        callback(snapshot);
      }
      this.threadMonitorInterval = setTimeout(poll, Math.max(500, interval));
    };
    void poll();
  }

  stopThreadMonitor(): void {
    this.threadMonitorGeneration++;
    if (this.threadMonitorInterval) {
      clearInterval(this.threadMonitorInterval);
      this.threadMonitorInterval = null;
    }
  }

  // ==================== GC Monitor ====================

  startGcMonitor(
    deviceId: string,
    packageName: string,
    callback: GcEventCallback
  ): void {
    this.stopGcMonitor();

    if (!deviceId || !packageName) {
      return;
    }

    const generation = ++this.gcMonitorGeneration;
    // Resuming the same app continues after the last line already read, so a
    // pause/resume doesn't replay (and duplicate) the logcat backlog.
    const key = `${deviceId}\u0000${packageName}`;
    if (this.gcStreamCursor?.key !== key) this.gcStreamCursor = { key, epoch: 0 };
    void this.startGcMonitorProcess(deviceId, packageName, callback, generation, this.gcStreamCursor);
  }

  /**
   * Stream the app's logcat for GC lines. `logcat --pid` follows one process,
   * so this runs as a background monitor that survives app restarts: it waits
   * for the app to start, and respawns when the PID changes or logcat exits.
   */
  private async startGcMonitorProcess(
    deviceId: string,
    packageName: string,
    callback: GcEventCallback,
    generation: number,
    cursor: { epoch: number }
  ): Promise<void> {
    const isCurrent = () => generation === this.gcMonitorGeneration;
    const retry = () => {
      if (!isCurrent()) return;
      if (this.gcMonitorTimer) clearTimeout(this.gcMonitorTimer);
      this.gcMonitorTimer = setTimeout(() => {
        this.gcMonitorTimer = null;
        void this.startGcMonitorProcess(deviceId, packageName, callback, generation, cursor);
      }, GC_MONITOR_RETRY_MS);
    };

    const pid = await this.getPid(deviceId, packageName);
    if (!isCurrent()) return;
    if (!pid) {
      // App not running (yet); check again shortly.
      retry();
      return;
    }

    // Monitor GC events via the app's logcat. Since Android 8 ART logs GC
    // lines under the process name rather than the `art` tag, so filter by
    // PID only and let parseGcLogLine pick out the GC messages. Epoch
    // timestamps give replayed backlog lines their real time and let a
    // restart resume right after the last line seen (-T).
    const process = spawn('adb', [
      '-s', deviceId,
      'logcat',
      '--pid', String(pid),
      '-v', 'epoch',
      ...(cursor.epoch > 0 ? ['-T', (cursor.epoch + 0.001).toFixed(3)] : []),
    ]);
    this.gcMonitorProcess = process;
    process.stdout?.setEncoding('utf8');

    let buffer = '';

    process.stdout?.on('data', (data: string) => {
      if (!isCurrent() || this.gcMonitorProcess !== process) return;
      buffer += data;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const epoch = parseLogcatEpoch(line);
        if (epoch !== null) cursor.epoch = Math.max(cursor.epoch, epoch);
        const gcEvent = this.parseGcLogLine(line);
        if (gcEvent) {
          if (epoch !== null) gcEvent.timestamp = Math.round(epoch * 1000);
          callback(gcEvent);
        }
      }
    });

    process.on('error', (error) => {
      if (this.gcMonitorProcess !== process) return;
      console.error('GC monitor process error:', error);
    });
    process.on('close', () => {
      if (this.gcMonitorProcess !== process) return;
      // logcat exited on its own (device hiccup, adb restart): re-attach.
      this.gcMonitorProcess = null;
      retry();
    });

    // `logcat --pid` keeps following a dead PID after the app restarts, so
    // periodically check whether the app now runs under a different PID.
    const watchPid = () => {
      this.gcMonitorTimer = setTimeout(async () => {
        this.gcMonitorTimer = null;
        const currentPid = await this.getPid(deviceId, packageName);
        if (!isCurrent() || this.gcMonitorProcess !== process) return;
        if (currentPid === pid) {
          watchPid();
          return;
        }
        this.gcMonitorProcess = null;
        process.kill();
        void this.startGcMonitorProcess(deviceId, packageName, callback, generation, cursor);
      }, GC_MONITOR_PID_CHECK_MS);
    };
    watchPid();
  }

  private parseGcLogLine(line: string): GcEvent | null {
    try {
      // Modern ART example:
      // Background concurrent copying GC freed 180675(9MB) AllocSpace objects,
      // 49% free, 8863KB/17MB, paused 231us,91us total 113.277ms
      const artReason = line.match(/([A-Za-z][A-Za-z ]*?)\s+GC\s+freed\s+/i)?.[1];
      const heapMatch = line.match(/([\d.]+)(B|KB|MB|GB)\/([\d.]+)(B|KB|MB|GB)/i);
      const freedMatch = line.match(/freed\s+[\d,]+(?:\(([\d.]+)(B|KB|MB|GB)\)|\s*(B|KB|MB|GB))/i);

      if (artReason && heapMatch) {
        const [, usedStr, usedUnit, totalStr, totalUnit] = heapMatch;
        const freed = freedMatch
          ? this.parseSize(freedMatch[1] || line.match(/freed\s+([\d.]+)/i)?.[1] || '0', freedMatch[2] || freedMatch[3] || 'B')
          : 0;
        const heapUsed = this.parseSize(usedStr, usedUnit);
        const heapTotal = this.parseSize(totalStr, totalUnit);
        const pauseSection = line.match(/paused\s+(.+?)(?:\s+total|$)/i)?.[1] || '';
        const pauseTime = Array.from(pauseSection.matchAll(/([\d.]+)\s*(us|ms)/gi))
          .reduce((total, match) => total + parseFloat(match[1]) * (match[2].toLowerCase() === 'us' ? 0.001 : 1), 0);

        const gcReason = this.parseGcReason(artReason);

        return {
          id: `gc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          reason: gcReason,
          freedBytes: freed,
          heapUsed,
          heapTotal,
          pauseTimeMs: pauseTime,
        };
      }

      // Pattern for Dalvik GC logs
      const dalvikMatch = line.match(
        /GC_(\w+)\s+freed\s+([\d.]+)([KMG]?),\s*([\d.]+)%\s*free\s*([\d.]+)([KMG]?)\/([\d.]+)([KMG]?),\s*paused\s*([\d.]+)ms/i
      );

      if (dalvikMatch) {
        const [, reason, freedStr, freedUnit, , usedStr, usedUnit, totalStr, totalUnit, pauseStr] = dalvikMatch;

        const freed = this.parseSize(freedStr, freedUnit);
        const heapUsed = this.parseSize(usedStr, usedUnit);
        const heapTotal = this.parseSize(totalStr, totalUnit);
        const pauseTime = parseFloat(pauseStr) || 0;

        const gcReason = this.parseGcReason(reason);

        return {
          id: `gc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          reason: gcReason,
          freedBytes: freed,
          heapUsed,
          heapTotal,
          pauseTimeMs: pauseTime,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private parseSize(value: string, unit: string): number {
    const num = parseFloat(value) || 0;
    switch (unit.toUpperCase().replace(/B$/, '')) {
      case 'K': return num * 1024;
      case 'M': return num * 1024 * 1024;
      case 'G': return num * 1024 * 1024 * 1024;
      default: return num;
    }
  }

  private parseGcReason(reason: string): GcReason {
    // ART prefixes the collector description with the GC cause, e.g.
    // "Explicit concurrent mark compact" or "Background young concurrent copying",
    // so the cause must win over the "concurrent" collector name.
    const upper = reason.toUpperCase();
    if (upper.includes('EXPLICIT')) return 'EXPLICIT';
    if (upper.includes('ALLOC') || upper === 'FOR_ALLOC') return 'FOR_ALLOC';
    if (upper.includes('BACKGROUND') || upper === 'BG') return 'BACKGROUND';
    if (upper.includes('CONCURRENT') || upper === 'CONC') return 'CONCURRENT';
    return 'UNKNOWN';
  }

  stopGcMonitor(): void {
    this.gcMonitorGeneration++;
    if (this.gcMonitorTimer) {
      clearTimeout(this.gcMonitorTimer);
      this.gcMonitorTimer = null;
    }
    if (this.gcMonitorProcess) {
      this.gcMonitorProcess.kill();
      this.gcMonitorProcess = null;
    }
  }

  // ==================== Heap Dump ====================

  async captureHeapDump(
    deviceId: string,
    packageName: string,
    onProgress?: (status: string, progress?: number) => void
  ): Promise<HeapDumpInfo> {
    const id = `heap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const remotePath = `/data/local/tmp/${id}.hprof`;
    const localPath = path.join(os.tmpdir(), `${id}.hprof`);
    let captureAttempted = false;

    try {
      onProgress?.('capturing', 10);

      // Check if app is debuggable
      const metadata = await this.getAppMetadata(deviceId, packageName);
      if (!metadata?.isDebuggable) {
        throw new Error('App must be debuggable to capture heap dump');
      }

      // Get PID
      const pid = await this.getPid(deviceId, packageName);
      if (!pid) {
        throw new Error('App is not running');
      }

      // Capture heap dump
      onProgress?.('capturing', 30);
      captureAttempted = true;
      await runAdb(
        deviceId,
        ['shell', 'am', 'dumpheap', String(pid), remotePath],
        { timeout: NO_TIMEOUT }
      );

      // Wait for dump to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      onProgress?.('capturing', 60);

      // Pull the file
      await runAdb(
        deviceId,
        ['pull', remotePath, localPath],
        { timeout: NO_TIMEOUT }
      );

      onProgress?.('capturing', 90);

      // Clean up remote file
      await runAdb(deviceId, ['shell', 'rm', remotePath]).catch(() => undefined);

      // Get file size
      const stats = fs.statSync(localPath);

      onProgress?.('ready', 100);

      return {
        id,
        timestamp: Date.now(),
        filePath: localPath,
        fileSize: stats.size,
        status: 'ready',
      };
    } catch (error) {
      if (captureAttempted) {
        await runAdb(deviceId, ['shell', 'rm', remotePath]).catch(() => undefined);
      }
      try {
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch (cleanupError) {
        console.error('Error cleaning up failed heap dump:', cleanupError);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        id,
        timestamp: Date.now(),
        filePath: '',
        fileSize: 0,
        status: 'error',
        error: message,
      };
    }
  }

  async analyzeHeapDump(filePath: string): Promise<HeapAnalysis | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return parseHprof(fs.readFileSync(filePath)).analysis;
    } catch (error) {
      console.error('Error analyzing heap dump:', error);
      return null;
    }
  }

  async getHeapInstances(filePath: string, classId: number): Promise<HeapInstance[]> {
    try {
      if (!fs.existsSync(filePath)) return [];
      return parseHprof(fs.readFileSync(filePath), { instanceClassId: classId }).instances.get(classId) ?? [];
    } catch (error) {
      console.error('Error parsing HPROF instances:', error);
      return [];
    }
  }

  deleteHeapDumps(filePaths: string[]): void {
    const tempDirectory = path.resolve(os.tmpdir());
    for (const filePath of filePaths.slice(0, 100)) {
      const resolved = path.resolve(filePath);
      const fileName = path.basename(resolved);
      if (path.dirname(resolved) !== tempDirectory || !/^heap-[a-zA-Z0-9-]+\.hprof$/.test(fileName)) {
        continue;
      }
      try {
        if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
      } catch (error) {
        console.error('Error deleting heap dump:', error);
      }
    }
  }

  // ==================== Method Trace ====================

  async startMethodTrace(
    deviceId: string,
    packageName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.methodTraceActive || this.methodTraceStarting) {
      return { success: false, error: 'A method trace is already active or starting' };
    }
    this.methodTraceStarting = true;
    const generation = ++this.methodTraceGeneration;
    try {
      // Check if app is debuggable
      const metadata = await this.getAppMetadata(deviceId, packageName);
      if (generation !== this.methodTraceGeneration) {
        return { success: false, error: 'Method trace start was cancelled' };
      }
      if (!metadata?.isDebuggable) {
        return { success: false, error: 'App must be debuggable to capture method trace' };
      }

      // Start profiling
      assertPackageName(packageName);
      const remotePath = `/data/local/tmp/android-debugger-${Date.now()}.trace`;
      await runAdb(
        deviceId,
        ['shell', 'am', 'profile', 'start', packageName, remotePath],
        { timeout: 10000 }
      );
      if (generation !== this.methodTraceGeneration) {
        await runAdb(deviceId, ['shell', 'am', 'profile', 'stop', packageName], { timeout: 10000 }).catch(() => undefined);
        await runAdb(deviceId, ['shell', 'rm', remotePath]).catch(() => undefined);
        return { success: false, error: 'Method trace start was cancelled' };
      }

      this.methodTraceActive = true;
      this.methodTraceStartTime = Date.now();
      this.methodTraceDeviceId = deviceId;
      this.methodTracePackageName = packageName;
      this.methodTraceRemotePath = remotePath;

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    } finally {
      this.methodTraceStarting = false;
    }
  }

  async stopMethodTrace(
    deviceId: string,
    packageName: string
  ): Promise<MethodTraceInfo> {
    const id = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const remotePath = this.methodTraceRemotePath;
    const localPath = path.join(os.tmpdir(), `${id}.trace`);

    try {
      if (!this.methodTraceActive || !remotePath) {
        return {
          id,
          timestamp: Date.now(),
          duration: 0,
          status: 'error',
          error: 'No trace is active',
        };
      }
      if (deviceId !== this.methodTraceDeviceId || packageName !== this.methodTracePackageName) {
        return {
          id,
          timestamp: Date.now(),
          duration: 0,
          status: 'error',
          error: 'The active trace belongs to a different device or package',
        };
      }

      const duration = Date.now() - this.methodTraceStartTime;
      // Stop profiling
      assertPackageName(packageName);
      await runAdb(
        deviceId,
        ['shell', 'am', 'profile', 'stop', packageName],
        { timeout: 10000 }
      );

      // Wait for trace to be written
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Pull the trace file
      await runAdb(
        deviceId,
        ['pull', remotePath, localPath],
        { timeout: NO_TIMEOUT }
      );

      // Clean up remote file
      await runAdb(deviceId, ['shell', 'rm', remotePath]).catch(() => undefined);
      this.clearMethodTraceState();

      return {
        id,
        timestamp: Date.now(),
        duration,
        filePath: localPath,
        status: 'ready',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.clearMethodTraceState();
      return {
        id,
        timestamp: Date.now(),
        duration: 0,
        status: 'error',
        error: message,
      };
    }
  }

  async analyzeMethodTrace(filePath: string): Promise<MethodTraceAnalysis | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      return parseMethodTrace(fs.readFileSync(filePath));
    } catch (error) {
      console.error('Error analyzing method trace:', error);
      return null;
    }
  }

  async cancelMethodTrace(): Promise<void> {
    this.methodTraceGeneration++;
    const deviceId = this.methodTraceDeviceId;
    const packageName = this.methodTracePackageName;
    const remotePath = this.methodTraceRemotePath;
    if (!this.methodTraceActive || !deviceId || !packageName) return;
    this.clearMethodTraceState();
    await runAdb(deviceId, ['shell', 'am', 'profile', 'stop', packageName], { timeout: 10000 }).catch(() => undefined);
    if (remotePath) {
      await runAdb(deviceId, ['shell', 'rm', remotePath]).catch(() => undefined);
    }
  }

  private clearMethodTraceState(): void {
    this.methodTraceActive = false;
    this.methodTraceStartTime = 0;
    this.methodTraceDeviceId = null;
    this.methodTracePackageName = null;
    this.methodTraceRemotePath = null;
  }

  async stopAll(finalizeRecording = true): Promise<void> {
    this.stopMemoryMonitor();
    this.stopCpuMonitor();
    this.stopFpsMonitor();
    this.stopLogcat();
    this.stopSdkLogcat();
    this.stopBatteryMonitor();
    this.stopCrashLogcat();
    this.stopNetworkStatsMonitor();
    this.stopThreadMonitor();
    this.stopGcMonitor();
    await this.cancelMethodTrace();
    if (finalizeRecording && this.recordingProcess && this.recordingDeviceId) {
      await this.stopScreenRecording(this.recordingDeviceId);
    }
  }
}

export const adbService = new AdbService();
