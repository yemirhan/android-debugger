import { spawn, exec, ChildProcess } from 'child_process';
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
  LogLevel,
  AppMetadata,
  DeveloperOptions,
  FileEntry,
  SharedPreference,
  DatabaseInfo,
  DatabaseQueryResult,
  IntentConfig,
  ScreenshotResult,
  SdkMessage,
  BatteryInfo,
  CrashEntry,
  ServiceInfo,
  AppNetworkStats,
  NetworkStats,
  ActivityStackInfo,
  ActivityInfo,
  TaskStack,
  JobSchedulerInfo,
  ScheduledJob,
  AlarmMonitorInfo,
  ScheduledAlarm,
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
  HeapClass,
  HeapInstance,
  HeapAnalysis,
  MethodTraceInfo,
  MethodStats,
  FlameChartEntry,
  MethodTraceAnalysis,
} from '@android-debugger/shared';
import { v4 as uuidv4 } from 'uuid';
import { LogcatMessageParser } from './logcat-parser';

const execAsync = promisify(exec);

type LogCallback = (entry: LogEntry) => void;
type SdkMessageCallback = (message: SdkMessage) => void;
type CrashCallback = (entry: CrashEntry) => void;
type ThreadCallback = (snapshot: ThreadSnapshot) => void;
type GcEventCallback = (event: GcEvent) => void;

export class AdbService extends EventEmitter {
  private logcatProcess: ChildProcess | null = null;
  private crashLogcatProcess: ChildProcess | null = null;
  private memoryInterval: NodeJS.Timeout | null = null;
  private cpuInterval: NodeJS.Timeout | null = null;
  private fpsInterval: NodeJS.Timeout | null = null;
  private batteryInterval: NodeJS.Timeout | null = null;
  private networkStatsInterval: NodeJS.Timeout | null = null;
  private logcatParser: LogcatMessageParser = new LogcatMessageParser();
  private sdkMessageCallback: SdkMessageCallback | null = null;

  // Profiler properties
  private threadMonitorInterval: NodeJS.Timeout | null = null;
  private gcMonitorProcess: ChildProcess | null = null;
  private methodTraceActive: boolean = false;
  private methodTraceStartTime: number = 0;

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
      const { stdout } = await execAsync('adb devices -l');
      const lines = stdout.trim().split('\n').slice(1);
      const devices: Device[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split(/\s+/);
        const id = parts[0];
        const status = parts[1] as Device['status'];

        if (status === 'device') {
          const deviceInfo = await this.getDeviceInfo(id);
          if (deviceInfo) {
            devices.push(deviceInfo);
          }
        } else {
          devices.push({
            id,
            model: 'Unknown',
            androidVersion: 'Unknown',
            status,
          });
        }
      }

      return devices;
    } catch (error) {
      console.error('Error getting devices:', error);
      return [];
    }
  }

  async getDeviceInfo(deviceId: string): Promise<Device | null> {
    try {
      const [modelResult, versionResult] = await Promise.all([
        execAsync(`adb -s ${deviceId} shell getprop ro.product.model`),
        execAsync(`adb -s ${deviceId} shell getprop ro.build.version.release`),
      ]);

      return {
        id: deviceId,
        model: modelResult.stdout.trim() || 'Unknown',
        androidVersion: versionResult.stdout.trim() || 'Unknown',
        status: 'device',
      };
    } catch (error) {
      console.error('Error getting device info:', error);
      return null;
    }
  }

  async getMemInfo(deviceId: string, packageName: string): Promise<MemoryInfo | null> {
    if (!deviceId || !packageName) {
      return null;
    }
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell dumpsys meminfo ${packageName}`
      );

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

    this.memoryInterval = setInterval(async () => {
      const info = await this.getMemInfo(deviceId, packageName);
      if (info) {
        callback(info);
      }
    }, interval);
  }

  stopMemoryMonitor(): void {
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
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell pidof -s ${packageName}`
      );
      const pid = parseInt(stdout.trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch (error) {
      console.log(`[AdbService] Could not get PID for ${packageName}:`, error);
      return null;
    }
  }

  startLogcat(
    deviceId: string,
    callback: LogCallback,
    filters?: string[],
    pid?: number
  ): void {
    this.stopLogcat();

    if (!deviceId) {
      return;
    }

    // Reset the parser when starting fresh
    this.logcatParser.reset();

    const defaultFilters = ['*:S', 'ReactNative:V', 'ReactNativeJS:V'];
    const logFilters = filters || defaultFilters;

    // Build args - use --pid if provided, otherwise use filters
    const args = ['-s', deviceId, 'logcat', '-v', 'time'];
    if (pid) {
      args.push('--pid', pid.toString());
    } else {
      args.push(...logFilters);
    }
    this.logcatProcess = spawn('adb', args);

    let buffer = '';

    this.logcatProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // Try to parse as SDK message first
        const sdkMessage = this.logcatParser.parseLogLine(line);
        if (sdkMessage) {
          // Emit SDK message event
          console.log('[AdbService] Emitting SDK message:', sdkMessage.type);
          this.emit('sdk-message', sdkMessage);
          if (this.sdkMessageCallback) {
            this.sdkMessageCallback(sdkMessage);
          }
          // Don't skip - also parse as regular log entry so it shows in Logs panel
        }

        // Regular log entry
        const entry = this.parseLogLine(line);
        if (entry) {
          callback(entry);
        } else if (line.trim()) {
          // Debug: log lines that don't match the expected format
          console.log('[AdbService] Line did not match log format:', line.substring(0, 80));
        }
      }
    });

    this.logcatProcess.stderr?.on('data', (data: Buffer) => {
      console.error('Logcat error:', data.toString());
    });

    this.logcatProcess.on('error', (error) => {
      console.error('Logcat process error:', error);
    });
  }

  private parseLogLine(line: string): LogEntry | null {
    // Format: MM-DD HH:MM:SS.mmm L/TAG(PID): message
    const match = line.match(
      /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEFS])\/([^(]+)\(\s*(\d+)\):\s*(.*)$/
    );

    if (match) {
      return {
        id: uuidv4(),
        timestamp: match[1],
        level: match[2] as LogLevel,
        tag: match[3].trim(),
        pid: parseInt(match[4], 10),
        message: match[5],
      };
    }

    // Alternative format without PID
    const altMatch = line.match(
      /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEFS])\/([^:]+):\s*(.*)$/
    );

    if (altMatch) {
      return {
        id: uuidv4(),
        timestamp: altMatch[1],
        level: altMatch[2] as LogLevel,
        tag: altMatch[3].trim(),
        message: altMatch[4],
      };
    }

    return null;
  }

  stopLogcat(): void {
    if (this.logcatProcess) {
      this.logcatProcess.kill();
      this.logcatProcess = null;
    }
  }

  async clearLogcat(deviceId: string): Promise<void> {
    try {
      await execAsync(`adb -s ${deviceId} logcat -c`);
    } catch (error) {
      console.error('Error clearing logcat:', error);
    }
  }

  async getCpuInfo(deviceId: string, packageName: string): Promise<CpuInfo | null> {
    if (!deviceId || !packageName) {
      return null;
    }
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell top -n 1 -b | grep ${packageName}`
      );

      const lines = stdout.trim().split('\n');
      if (lines.length === 0) return null;

      // Parse CPU usage - format varies by Android version
      // Typical format: PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ ARGS
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          // Find the CPU percentage column (usually index 8 or 9)
          for (let i = 7; i < parts.length; i++) {
            const value = parseFloat(parts[i]);
            if (!isNaN(value) && value >= 0 && value <= 100) {
              return {
                timestamp: Date.now(),
                usage: value,
              };
            }
          }
        }
      }

      return null;
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

    this.cpuInterval = setInterval(async () => {
      const info = await this.getCpuInfo(deviceId, packageName);
      if (info) {
        callback(info);
      }
    }, interval);
  }

  stopCpuMonitor(): void {
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
      // Reset gfxinfo stats
      await execAsync(`adb -s ${deviceId} shell dumpsys gfxinfo ${packageName} reset`);

      // Wait a moment for frame data to accumulate
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell dumpsys gfxinfo ${packageName} framestats`
      );

      return this.parseFpsInfo(stdout);
    } catch (error) {
      console.error('Error getting FPS info:', error);
      return null;
    }
  }

  private parseFpsInfo(output: string): FpsInfo | null {
    try {
      const lines = output.split('\n');
      let totalFrames = 0;
      let jankyFrames = 0;
      const frameTimes: number[] = [];

      for (const line of lines) {
        const trimmed = line.trim();

        // Parse total frames
        const totalMatch = trimmed.match(/Total frames rendered:\s*(\d+)/);
        if (totalMatch) {
          totalFrames = parseInt(totalMatch[1], 10);
        }

        // Parse janky frames
        const jankyMatch = trimmed.match(/Janky frames:\s*(\d+)/);
        if (jankyMatch) {
          jankyFrames = parseInt(jankyMatch[1], 10);
        }

        // Parse frame times from framestats section
        if (trimmed.match(/^\d+,\d+,/)) {
          const parts = trimmed.split(',');
          if (parts.length >= 2) {
            const frameTime = (parseInt(parts[1], 10) - parseInt(parts[0], 10)) / 1000000; // Convert to ms
            if (!isNaN(frameTime) && frameTime > 0 && frameTime < 1000) {
              frameTimes.push(frameTime);
            }
          }
        }
      }

      // Calculate percentiles
      frameTimes.sort((a, b) => a - b);
      const getPercentile = (arr: number[], p: number) => {
        if (arr.length === 0) return 0;
        const index = Math.ceil((p / 100) * arr.length) - 1;
        return arr[Math.max(0, index)] || 0;
      };

      // Estimate FPS based on frame count and time window
      const fps = frameTimes.length > 0 ? Math.min(60, 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length)) : 60;

      return {
        timestamp: Date.now(),
        fps: Math.round(fps),
        jankyFrames,
        totalFrames,
        percentile90: getPercentile(frameTimes, 90),
        percentile95: getPercentile(frameTimes, 95),
        percentile99: getPercentile(frameTimes, 99),
      };
    } catch (error) {
      console.error('Error parsing FPS info:', error);
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

    this.fpsInterval = setInterval(async () => {
      const info = await this.getFpsInfo(deviceId, packageName);
      if (info) {
        callback(info);
      }
    }, interval);
  }

  stopFpsMonitor(): void {
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
  }

  async getPackages(deviceId: string, debuggableOnly: boolean = false): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell pm list packages${debuggableOnly ? ' -3' : ''}`
      );

      return stdout
        .trim()
        .split('\n')
        .map((line) => line.replace('package:', '').trim())
        .filter(Boolean)
        .sort();
    } catch (error) {
      console.error('Error getting packages:', error);
      return [];
    }
  }

  async launchApp(deviceId: string, packageName: string): Promise<void> {
    try {
      await execAsync(
        `adb -s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`
      );
    } catch (error) {
      console.error('Error launching app:', error);
      throw error;
    }
  }

  async killApp(deviceId: string, packageName: string): Promise<void> {
    try {
      await execAsync(`adb -s ${deviceId} shell am force-stop ${packageName}`);
    } catch (error) {
      console.error('Error killing app:', error);
      throw error;
    }
  }

  async clearAppData(deviceId: string, packageName: string): Promise<void> {
    try {
      await execAsync(`adb -s ${deviceId} shell pm clear ${packageName}`);
    } catch (error) {
      console.error('Error clearing app data:', error);
      throw error;
    }
  }

  // ==================== App Metadata ====================

  async getAppMetadata(deviceId: string, packageName: string): Promise<AppMetadata | null> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell dumpsys package ${packageName}`
      );

      return this.parseAppMetadata(packageName, stdout);
    } catch (error) {
      console.error('Error getting app metadata:', error);
      return null;
    }
  }

  private parseAppMetadata(packageName: string, output: string): AppMetadata | null {
    try {
      const metadata: Partial<AppMetadata> = {
        packageName,
        permissions: [],
        isDebuggable: false,
        isSystem: false,
      };

      const lines = output.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Version info
        const versionNameMatch = trimmed.match(/versionName=([^\s]+)/);
        if (versionNameMatch) {
          metadata.versionName = versionNameMatch[1];
        }

        const versionCodeMatch = trimmed.match(/versionCode=(\d+)/);
        if (versionCodeMatch) {
          metadata.versionCode = parseInt(versionCodeMatch[1], 10);
        }

        // SDK versions
        const targetSdkMatch = trimmed.match(/targetSdk=(\d+)/);
        if (targetSdkMatch) {
          metadata.targetSdk = parseInt(targetSdkMatch[1], 10);
        }

        const minSdkMatch = trimmed.match(/minSdk=(\d+)/);
        if (minSdkMatch) {
          metadata.minSdk = parseInt(minSdkMatch[1], 10);
        }

        // Install times
        const firstInstallMatch = trimmed.match(/firstInstallTime=([^\s]+)/);
        if (firstInstallMatch) {
          metadata.firstInstallTime = firstInstallMatch[1];
        }

        const lastUpdateMatch = trimmed.match(/lastUpdateTime=([^\s]+)/);
        if (lastUpdateMatch) {
          metadata.lastUpdateTime = lastUpdateMatch[1];
        }

        // Flags
        if (trimmed.includes('DEBUGGABLE')) {
          metadata.isDebuggable = true;
        }
        if (trimmed.includes('SYSTEM')) {
          metadata.isSystem = true;
        }

        // Permissions
        const permMatch = trimmed.match(/android\.permission\.([A-Z_]+)/);
        if (permMatch && metadata.permissions) {
          const perm = `android.permission.${permMatch[1]}`;
          if (!metadata.permissions.includes(perm)) {
            metadata.permissions.push(perm);
          }
        }
      }

      // Get app sizes from stat command
      try {
        // This is a simplified version - actual implementation would need to sum directory sizes
        metadata.apkSize = 0;
        metadata.dataSize = 0;
        metadata.cacheSize = 0;
      } catch {
        // Ignore size errors
      }

      return {
        packageName: metadata.packageName!,
        versionName: metadata.versionName || 'Unknown',
        versionCode: metadata.versionCode || 0,
        targetSdk: metadata.targetSdk || 0,
        minSdk: metadata.minSdk || 0,
        firstInstallTime: metadata.firstInstallTime || 'Unknown',
        lastUpdateTime: metadata.lastUpdateTime || 'Unknown',
        apkSize: metadata.apkSize || 0,
        dataSize: metadata.dataSize || 0,
        cacheSize: metadata.cacheSize || 0,
        permissions: metadata.permissions || [],
        isDebuggable: metadata.isDebuggable || false,
        isSystem: metadata.isSystem || false,
      };
    } catch (error) {
      console.error('Error parsing app metadata:', error);
      return null;
    }
  }

  // ==================== Screenshot & Screen Recording ====================

  private recordingProcess: ChildProcess | null = null;
  private recordingPath: string | null = null;

  async takeScreenshot(deviceId: string, outputPath?: string): Promise<ScreenshotResult | null> {
    try {
      const timestamp = Date.now();
      const remotePath = '/sdcard/screenshot.png';
      const localPath = outputPath || path.join(os.tmpdir(), `screenshot_${timestamp}.png`);

      // Take screenshot on device
      await execAsync(`adb -s ${deviceId} shell screencap -p ${remotePath}`);

      // Pull to local machine
      await execAsync(`adb -s ${deviceId} pull ${remotePath} "${localPath}"`);

      // Clean up remote file
      await execAsync(`adb -s ${deviceId} shell rm ${remotePath}`);

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
    onStateChange?: (isRecording: boolean) => void
  ): Promise<{ success: boolean; path?: string }> {
    try {
      if (this.recordingProcess) {
        return { success: false };
      }

      const timestamp = Date.now();
      const remotePath = '/sdcard/screenrecord.mp4';
      this.recordingPath = outputPath || path.join(os.tmpdir(), `recording_${timestamp}.mp4`);

      // Start recording (max 3 minutes by default)
      this.recordingProcess = spawn('adb', [
        '-s', deviceId,
        'shell', 'screenrecord',
        '--time-limit', '180',
        remotePath,
      ]);

      this.recordingProcess.on('close', () => {
        this.recordingProcess = null;
        onStateChange?.(false);
      });

      onStateChange?.(true);
      return { success: true, path: this.recordingPath };
    } catch (error) {
      console.error('Error starting screen recording:', error);
      return { success: false };
    }
  }

  async stopScreenRecording(deviceId: string): Promise<{ success: boolean; path?: string }> {
    try {
      if (!this.recordingProcess) {
        return { success: false };
      }

      // Send interrupt to stop recording
      this.recordingProcess.kill('SIGINT');

      // Wait a moment for the file to be finalized
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const remotePath = '/sdcard/screenrecord.mp4';
      const localPath = this.recordingPath || path.join(os.tmpdir(), 'recording.mp4');

      // Pull to local machine
      await execAsync(`adb -s ${deviceId} pull ${remotePath} "${localPath}"`);

      // Clean up remote file
      await execAsync(`adb -s ${deviceId} shell rm ${remotePath}`);

      this.recordingProcess = null;
      this.recordingPath = null;

      return { success: true, path: localPath };
    } catch (error) {
      console.error('Error stopping screen recording:', error);
      this.recordingProcess = null;
      this.recordingPath = null;
      return { success: false };
    }
  }

  // ==================== Developer Options ====================

  async getDeveloperOptions(deviceId: string): Promise<DeveloperOptions | null> {
    try {
      const [layoutBounds, gpuOverdraw, windowAnim, transitionAnim, animatorAnim, showTouches, pointerLocation] =
        await Promise.all([
          execAsync(`adb -s ${deviceId} shell getprop debug.layout`).catch(() => ({ stdout: '' })),
          execAsync(`adb -s ${deviceId} shell getprop debug.hwui.overdraw`).catch(() => ({ stdout: '' })),
          execAsync(`adb -s ${deviceId} shell settings get global window_animation_scale`).catch(() => ({ stdout: '1.0' })),
          execAsync(`adb -s ${deviceId} shell settings get global transition_animation_scale`).catch(() => ({ stdout: '1.0' })),
          execAsync(`adb -s ${deviceId} shell settings get global animator_duration_scale`).catch(() => ({ stdout: '1.0' })),
          execAsync(`adb -s ${deviceId} shell settings get system show_touches`).catch(() => ({ stdout: '0' })),
          execAsync(`adb -s ${deviceId} shell settings get system pointer_location`).catch(() => ({ stdout: '0' })),
        ]);

      return {
        layoutBounds: layoutBounds.stdout.trim() === 'true',
        gpuOverdraw: (gpuOverdraw.stdout.trim() || 'off') as DeveloperOptions['gpuOverdraw'],
        windowAnimationScale: parseFloat(windowAnim.stdout.trim()) || 1.0,
        transitionAnimationScale: parseFloat(transitionAnim.stdout.trim()) || 1.0,
        animatorDurationScale: parseFloat(animatorAnim.stdout.trim()) || 1.0,
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
      await execAsync(`adb -s ${deviceId} shell setprop debug.layout ${enabled}`);
      // Need to restart UI to take effect
      await execAsync(`adb -s ${deviceId} shell service call activity 1599295570`);
      return true;
    } catch (error) {
      console.error('Error setting layout bounds:', error);
      return false;
    }
  }

  async setGpuOverdraw(deviceId: string, mode: DeveloperOptions['gpuOverdraw']): Promise<boolean> {
    try {
      const value = mode === 'off' ? 'false' : mode;
      await execAsync(`adb -s ${deviceId} shell setprop debug.hwui.overdraw ${value}`);
      // Need to restart UI to take effect
      await execAsync(`adb -s ${deviceId} shell service call activity 1599295570`);
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

      await execAsync(`adb -s ${deviceId} shell settings put global ${settingName} ${scale}`);
      return true;
    } catch (error) {
      console.error('Error setting animation scale:', error);
      return false;
    }
  }

  async setShowTouches(deviceId: string, enabled: boolean): Promise<boolean> {
    try {
      await execAsync(`adb -s ${deviceId} shell settings put system show_touches ${enabled ? 1 : 0}`);
      return true;
    } catch (error) {
      console.error('Error setting show touches:', error);
      return false;
    }
  }

  async setPointerLocation(deviceId: string, enabled: boolean): Promise<boolean> {
    try {
      await execAsync(`adb -s ${deviceId} shell settings put system pointer_location ${enabled ? 1 : 0}`);
      return true;
    } catch (error) {
      console.error('Error setting pointer location:', error);
      return false;
    }
  }

  // ==================== File Inspector ====================

  async listAppFiles(deviceId: string, packageName: string, relativePath: string = ''): Promise<FileEntry[]> {
    try {
      const basePath = `/data/data/${packageName}`;
      const fullPath = relativePath ? `${basePath}/${relativePath}` : basePath;

      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell run-as ${packageName} ls -la "${fullPath}"`
      );

      const entries: FileEntry[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        if (line.startsWith('total') || !line.trim()) continue;

        // Parse ls -la output: drwxrwx--x 2 u0_a123 u0_a123 4096 2024-01-15 10:30 dirname
        const match = line.match(
          /^([drwx-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/
        );

        if (match) {
          const [, permissions, size, modified, name] = match;
          if (name === '.' || name === '..') continue;

          entries.push({
            name,
            path: relativePath ? `${relativePath}/${name}` : name,
            type: permissions.startsWith('d') ? 'directory' : 'file',
            size: parseInt(size, 10),
            modified,
            permissions,
          });
        }
      }

      return entries;
    } catch (error) {
      console.error('Error listing app files:', error);
      return [];
    }
  }

  async readAppFile(deviceId: string, packageName: string, relativePath: string): Promise<string | null> {
    try {
      const basePath = `/data/data/${packageName}`;
      const fullPath = `${basePath}/${relativePath}`;

      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell run-as ${packageName} cat "${fullPath}"`
      );

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
            const entries = this.parseSharedPrefsXml(content);
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

  private parseSharedPrefsXml(xml: string): Record<string, { type: string; value: unknown }> {
    const entries: Record<string, { type: string; value: unknown }> = {};

    // Parse string entries
    const stringMatches = xml.matchAll(/<string name="([^"]+)"[^>]*>([^<]*)<\/string>/g);
    for (const match of stringMatches) {
      entries[match[1]] = { type: 'string', value: match[2] };
    }

    // Parse int entries
    const intMatches = xml.matchAll(/<int name="([^"]+)" value="([^"]+)"[^/]*\/>/g);
    for (const match of intMatches) {
      entries[match[1]] = { type: 'int', value: parseInt(match[2], 10) };
    }

    // Parse long entries
    const longMatches = xml.matchAll(/<long name="([^"]+)" value="([^"]+)"[^/]*\/>/g);
    for (const match of longMatches) {
      entries[match[1]] = { type: 'long', value: parseInt(match[2], 10) };
    }

    // Parse float entries
    const floatMatches = xml.matchAll(/<float name="([^"]+)" value="([^"]+)"[^/]*\/>/g);
    for (const match of floatMatches) {
      entries[match[1]] = { type: 'float', value: parseFloat(match[2]) };
    }

    // Parse boolean entries
    const boolMatches = xml.matchAll(/<boolean name="([^"]+)" value="([^"]+)"[^/]*\/>/g);
    for (const match of boolMatches) {
      entries[match[1]] = { type: 'boolean', value: match[2] === 'true' };
    }

    return entries;
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
      const dbPath = `/data/data/${packageName}/databases/${dbName}`;
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell run-as ${packageName} sqlite3 "${dbPath}" ".tables"`
      );

      return stdout.trim().split(/\s+/).filter(Boolean);
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
      const dbPath = `/data/data/${packageName}/databases/${dbName}`;
      // Use -header -separator for CSV-like output
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell run-as ${packageName} sqlite3 -header -separator '|' "${dbPath}" "${query.replace(/"/g, '\\"')}"`
      );

      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length === 0) {
        return { columns: [], rows: [], rowCount: 0 };
      }

      const columns = lines[0].split('|');
      const rows = lines.slice(1).map((line) =>
        line.split('|').map((val) => {
          // Try to parse as number
          const num = Number(val);
          return isNaN(num) ? val : num;
        })
      );

      return {
        columns,
        rows,
        rowCount: rows.length,
      };
    } catch (error) {
      console.error('Error querying database:', error);
      return null;
    }
  }

  // ==================== Intent Tester ====================

  async fireIntent(deviceId: string, intent: IntentConfig): Promise<{ success: boolean; error?: string }> {
    try {
      let cmd = `adb -s ${deviceId} shell am start`;

      // Action
      if (intent.action) {
        cmd += ` -a ${intent.action}`;
      }

      // Data URI
      if (intent.data) {
        cmd += ` -d "${intent.data}"`;
      }

      // MIME type
      if (intent.type) {
        cmd += ` -t ${intent.type}`;
      }

      // Category
      if (intent.category) {
        cmd += ` -c ${intent.category}`;
      }

      // Component
      if (intent.component) {
        cmd += ` -n ${intent.component}`;
      }

      // Flags
      for (const flag of intent.flags) {
        cmd += ` -f ${flag}`;
      }

      // Extras
      for (const extra of intent.extras) {
        const typeFlag = {
          string: '--es',
          int: '--ei',
          long: '--el',
          float: '--ef',
          double: '--ed',
          boolean: '--ez',
          uri: '--eu',
        }[extra.type];

        cmd += ` ${typeFlag} "${extra.key}" "${extra.value}"`;
      }

      const { stdout, stderr } = await execAsync(cmd);

      if (stderr && stderr.includes('Error')) {
        return { success: false, error: stderr };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async fireDeepLink(deviceId: string, uri: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { stdout, stderr } = await execAsync(
        `adb -s ${deviceId} shell am start -a android.intent.action.VIEW -d "${uri}"`
      );

      if (stderr && stderr.includes('Error')) {
        return { success: false, error: stderr };
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
      const { stdout } = await execAsync(`adb -s ${deviceId} shell dumpsys battery`);
      return this.parseBatteryInfo(stdout);
    } catch (error) {
      console.error('Error getting battery info:', error);
      return null;
    }
  }

  private parseBatteryInfo(output: string): BatteryInfo | null {
    try {
      const info: Partial<BatteryInfo> = {
        timestamp: Date.now(),
      };

      const lines = output.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Parse level
        const levelMatch = trimmed.match(/level:\s*(\d+)/i);
        if (levelMatch) {
          info.level = parseInt(levelMatch[1], 10);
        }

        // Parse temperature (in tenths of a degree Celsius)
        const tempMatch = trimmed.match(/temperature:\s*(\d+)/i);
        if (tempMatch) {
          info.temperature = parseInt(tempMatch[1], 10) / 10;
        }

        // Parse voltage (in millivolts)
        const voltageMatch = trimmed.match(/voltage:\s*(\d+)/i);
        if (voltageMatch) {
          info.voltage = parseInt(voltageMatch[1], 10);
        }

        // Parse health
        const healthMatch = trimmed.match(/health:\s*(\d+)/i);
        if (healthMatch) {
          const healthCode = parseInt(healthMatch[1], 10);
          const healthMap: Record<number, BatteryInfo['health']> = {
            1: 'unknown',
            2: 'good',
            3: 'overheat',
            4: 'dead',
            5: 'over_voltage',
            6: 'unknown', // unspecified failure
            7: 'cold',
          };
          info.health = healthMap[healthCode] || 'unknown';
        }

        // Parse status
        const statusMatch = trimmed.match(/status:\s*(\d+)/i);
        if (statusMatch) {
          const statusCode = parseInt(statusMatch[1], 10);
          const statusMap: Record<number, BatteryInfo['status']> = {
            1: 'unknown',
            2: 'charging',
            3: 'discharging',
            4: 'not_charging',
            5: 'full',
          };
          info.status = statusMap[statusCode] || 'unknown';
        }

        // Parse plugged
        const pluggedMatch = trimmed.match(/plugged:\s*(\d+)/i);
        if (pluggedMatch) {
          const pluggedCode = parseInt(pluggedMatch[1], 10);
          const pluggedMap: Record<number, BatteryInfo['plugged']> = {
            0: 'none',
            1: 'ac',
            2: 'usb',
            4: 'wireless',
          };
          info.plugged = pluggedMap[pluggedCode] || 'none';
        }
      }

      if (info.level === undefined) {
        return null;
      }

      return {
        timestamp: info.timestamp!,
        level: info.level,
        temperature: info.temperature || 0,
        health: info.health || 'unknown',
        status: info.status || 'unknown',
        plugged: info.plugged || 'none',
        voltage: info.voltage || 0,
      };
    } catch (error) {
      console.error('Error parsing battery info:', error);
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

    this.batteryInterval = setInterval(async () => {
      const info = await this.getBatteryInfo(deviceId);
      if (info) {
        callback(info);
      }
    }, interval);
  }

  stopBatteryMonitor(): void {
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

    const args = ['-s', deviceId, 'logcat', '-b', 'crash', '-v', 'time'];
    this.crashLogcatProcess = spawn('adb', args);

    let buffer = '';
    let currentCrash: Partial<CrashEntry> | null = null;

    this.crashLogcatProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // Detect start of a crash (FATAL EXCEPTION or native signal)
        const fatalMatch = line.match(/FATAL EXCEPTION:\s*(.+)/);
        const nativeSignalMatch = line.match(/signal\s+(\d+)\s+\(([^)]+)\)/i);
        const timestampMatch = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);

        if (fatalMatch || nativeSignalMatch) {
          // Save previous crash if exists
          if (currentCrash && currentCrash.message) {
            callback(this.finalizeCrashEntry(currentCrash));
          }

          // Start new crash entry
          currentCrash = {
            id: uuidv4(),
            timestamp: timestampMatch?.[1] || new Date().toISOString(),
            processName: fatalMatch?.[1]?.trim() || 'Unknown',
            pid: 0,
            signal: nativeSignalMatch?.[2],
            message: line,
            stackTrace: [],
            raw: line,
          };

          // Extract PID from log line if present
          const pidMatch = line.match(/\(\s*(\d+)\)/);
          if (pidMatch) {
            currentCrash.pid = parseInt(pidMatch[1], 10);
          }
        } else if (currentCrash) {
          // Add to current crash stack trace
          currentCrash.raw += '\n' + line;

          // Check if this looks like a stack trace line
          if (line.includes('\tat ') || line.includes('    at ') || line.match(/^\s+#\d+/)) {
            currentCrash.stackTrace?.push(line.trim());
          }

          // Check for process/thread info
          const processMatch = line.match(/Process:\s*([^\s,]+)/);
          if (processMatch) {
            currentCrash.processName = processMatch[1];
          }

          const pidLineMatch = line.match(/PID:\s*(\d+)/);
          if (pidLineMatch) {
            currentCrash.pid = parseInt(pidLineMatch[1], 10);
          }
        }
      }
    });

    this.crashLogcatProcess.on('close', () => {
      // Emit any remaining crash
      if (currentCrash && currentCrash.message) {
        callback(this.finalizeCrashEntry(currentCrash));
      }
      this.crashLogcatProcess = null;
    });

    this.crashLogcatProcess.stderr?.on('data', (data: Buffer) => {
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
      await execAsync(`adb -s ${deviceId} logcat -b crash -c`);
    } catch (error) {
      console.error('Error clearing crash logcat:', error);
    }
  }

  // ==================== Running Services ====================

  async getRunningServices(deviceId: string, packageName?: string): Promise<ServiceInfo[]> {
    try {
      const cmd = packageName
        ? `adb -s ${deviceId} shell dumpsys activity services ${packageName}`
        : `adb -s ${deviceId} shell dumpsys activity services`;

      const { stdout } = await execAsync(cmd);
      return this.parseServicesInfo(stdout, packageName);
    } catch (error) {
      console.error('Error getting running services:', error);
      return [];
    }
  }

  private parseServicesInfo(output: string, filterPackage?: string): ServiceInfo[] {
    const services: ServiceInfo[] = [];
    const lines = output.split('\n');

    let currentService: Partial<ServiceInfo> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match service record start: * ServiceRecord{...} or ServiceRecord{...}
      const serviceMatch = trimmed.match(/\*?\s*ServiceRecord\{[^}]+\s+([^/]+)\/([^\s}]+)/);
      if (serviceMatch) {
        // Save previous service
        if (currentService && currentService.name) {
          services.push(this.finalizeServiceEntry(currentService));
        }

        currentService = {
          packageName: serviceMatch[1],
          name: serviceMatch[2],
          pid: 0,
          state: 'started',
          foreground: false,
          clientCount: 0,
        };
        continue;
      }

      if (currentService) {
        // Parse app info with PID
        const appMatch = trimmed.match(/app=ProcessRecord\{[^}]+\s+(\d+):/);
        if (appMatch) {
          currentService.pid = parseInt(appMatch[1], 10);
        }

        // Check for foreground
        if (trimmed.includes('isForeground=true')) {
          currentService.foreground = true;
        }

        // Check for connections/bindings count
        const bindingsMatch = trimmed.match(/bindings=.*size=(\d+)/);
        if (bindingsMatch) {
          currentService.clientCount = parseInt(bindingsMatch[1], 10);
          if (currentService.clientCount > 0) {
            currentService.state = currentService.state === 'started' ? 'started+bound' : 'bound';
          }
        }
      }
    }

    // Add final service
    if (currentService && currentService.name) {
      services.push(this.finalizeServiceEntry(currentService));
    }

    // Filter by package if specified
    if (filterPackage) {
      return services.filter(s => s.packageName === filterPackage);
    }

    return services;
  }

  private finalizeServiceEntry(partial: Partial<ServiceInfo>): ServiceInfo {
    return {
      name: partial.name || 'Unknown',
      packageName: partial.packageName || 'Unknown',
      pid: partial.pid || 0,
      state: partial.state || 'started',
      foreground: partial.foreground || false,
      clientCount: partial.clientCount || 0,
    };
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
        const { stdout: uidOutput } = await execAsync(
          `adb -s ${deviceId} shell dumpsys package ${packageName} | grep userId=`
        );
        const uidMatch = uidOutput.match(/userId=(\d+)/);
        if (uidMatch) {
          uid = parseInt(uidMatch[1], 10);
        }
      }

      const { stdout } = await execAsync(`adb -s ${deviceId} shell dumpsys netstats detail`);
      return this.parseNetworkStats(stdout, packageName, uid);
    } catch (error) {
      console.error('Error getting network stats:', error);
      return null;
    }
  }

  private parseNetworkStats(output: string, packageName?: string, uid?: number | null): AppNetworkStats | null {
    try {
      const timestamp = Date.now();
      const stats: AppNetworkStats = {
        packageName: packageName || 'all',
        wifi: {
          timestamp,
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
        },
        mobile: {
          timestamp,
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
        },
      };

      const lines = output.split('\n');
      let currentSection = '';
      let inUidSection = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Detect section
        if (trimmed.includes('iface=wlan') || trimmed.includes('type=WIFI')) {
          currentSection = 'wifi';
        } else if (trimmed.includes('iface=rmnet') || trimmed.includes('type=MOBILE')) {
          currentSection = 'mobile';
        }

        // Check for UID section
        if (uid !== null) {
          if (trimmed.includes(`uid=${uid}`)) {
            inUidSection = true;
          } else if (trimmed.startsWith('uid=') && !trimmed.includes(`uid=${uid}`)) {
            inUidSection = false;
          }
        } else {
          // If no UID filter, count all traffic
          inUidSection = true;
        }

        if (inUidSection && currentSection) {
          // Parse byte counts: rxBytes=xxx txBytes=xxx
          const rxBytesMatch = trimmed.match(/rxBytes=(\d+)/);
          const txBytesMatch = trimmed.match(/txBytes=(\d+)/);
          const rxPacketsMatch = trimmed.match(/rxPackets=(\d+)/);
          const txPacketsMatch = trimmed.match(/txPackets=(\d+)/);

          if (currentSection === 'wifi') {
            if (rxBytesMatch) stats.wifi.rxBytes += parseInt(rxBytesMatch[1], 10);
            if (txBytesMatch) stats.wifi.txBytes += parseInt(txBytesMatch[1], 10);
            if (rxPacketsMatch) stats.wifi.rxPackets += parseInt(rxPacketsMatch[1], 10);
            if (txPacketsMatch) stats.wifi.txPackets += parseInt(txPacketsMatch[1], 10);
          } else if (currentSection === 'mobile') {
            if (rxBytesMatch) stats.mobile.rxBytes += parseInt(rxBytesMatch[1], 10);
            if (txBytesMatch) stats.mobile.txBytes += parseInt(txBytesMatch[1], 10);
            if (rxPacketsMatch) stats.mobile.rxPackets += parseInt(rxPacketsMatch[1], 10);
            if (txPacketsMatch) stats.mobile.txPackets += parseInt(txPacketsMatch[1], 10);
          }
        }
      }

      return stats;
    } catch (error) {
      console.error('Error parsing network stats:', error);
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

    this.networkStatsInterval = setInterval(async () => {
      const stats = await this.getNetworkStats(deviceId, packageName);
      if (stats) {
        callback(stats);
      }
    }, interval);
  }

  stopNetworkStatsMonitor(): void {
    if (this.networkStatsInterval) {
      clearInterval(this.networkStatsInterval);
      this.networkStatsInterval = null;
    }
  }

  // ==================== Activity Stack ====================

  async getActivityStack(deviceId: string, packageName: string): Promise<ActivityStackInfo | null> {
    try {
      const { stdout } = await execAsync(
        `adb -s ${deviceId} shell dumpsys activity activities ${packageName}`
      );
      return this.parseActivityStack(packageName, stdout);
    } catch (error) {
      console.error('Error getting activity stack:', error);
      return null;
    }
  }

  private parseActivityStack(packageName: string, output: string): ActivityStackInfo | null {
    try {
      const info: ActivityStackInfo = {
        timestamp: Date.now(),
        packageName,
        tasks: [],
      };

      const lines = output.split('\n');
      let currentTask: TaskStack | null = null;
      let inTaskSection = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Parse focused activity
        const focusedMatch = trimmed.match(/mFocusedActivity:\s*ActivityRecord\{[^}]+\s+([^\s}]+)/);
        if (focusedMatch) {
          info.focusedActivity = focusedMatch[1];
        }

        // Parse Task block: Task{xxx #123 ...} or Task #123
        const taskMatch = trimmed.match(/Task(?:\{[^}]+)?\s*#(\d+)/);
        if (taskMatch) {
          if (currentTask && currentTask.activities.length > 0) {
            info.tasks.push(currentTask);
          }
          currentTask = {
            taskId: parseInt(taskMatch[1], 10),
            rootActivity: '',
            activities: [],
            isVisible: trimmed.includes('visible=true') || trimmed.includes('isVisible=true'),
          };
          inTaskSection = true;
        }

        // Parse ActivityRecord: * ActivityRecord{xxx com.example/.MainActivity t123}
        if (currentTask && inTaskSection) {
          const activityMatch = trimmed.match(/ActivityRecord\{[^}]+\s+([^\s]+)\s+t(\d+)/);
          if (activityMatch) {
            const fullName = activityMatch[1];
            const taskId = parseInt(activityMatch[2], 10);

            // Parse activity name parts
            let activityPackage = packageName;
            let shortName = fullName;

            if (fullName.includes('/')) {
              const parts = fullName.split('/');
              activityPackage = parts[0];
              shortName = parts[1].startsWith('.')
                ? parts[1].substring(1)
                : parts[1];
            }

            // Parse state from the line
            let state: ActivityInfo['state'] = 'stopped';
            if (trimmed.includes('state=RESUMED') || trimmed.includes('RESUMED')) {
              state = 'resumed';
            } else if (trimmed.includes('state=PAUSED') || trimmed.includes('PAUSED')) {
              state = 'paused';
            } else if (trimmed.includes('state=STOPPED') || trimmed.includes('STOPPED')) {
              state = 'stopped';
            } else if (trimmed.includes('state=DESTROYED') || trimmed.includes('DESTROYED')) {
              state = 'destroyed';
            }

            const activityInfo: ActivityInfo = {
              name: fullName,
              shortName,
              packageName: activityPackage,
              taskId,
              state,
              isTop: currentTask.activities.length === 0, // First activity is on top
            };

            currentTask.activities.push(activityInfo);

            if (!currentTask.rootActivity) {
              currentTask.rootActivity = fullName;
            }
          }
        }
      }

      // Add last task
      if (currentTask && currentTask.activities.length > 0) {
        info.tasks.push(currentTask);
      }

      return info;
    } catch (error) {
      console.error('Error parsing activity stack:', error);
      return null;
    }
  }

  // ==================== Job Scheduler ====================

  async getScheduledJobs(deviceId: string, packageName?: string): Promise<JobSchedulerInfo | null> {
    try {
      const cmd = packageName
        ? `adb -s ${deviceId} shell dumpsys jobscheduler ${packageName}`
        : `adb -s ${deviceId} shell dumpsys jobscheduler`;

      const { stdout } = await execAsync(cmd);
      return this.parseScheduledJobs(stdout, packageName);
    } catch (error) {
      console.error('Error getting scheduled jobs:', error);
      return null;
    }
  }

  private parseScheduledJobs(output: string, filterPackage?: string): JobSchedulerInfo | null {
    try {
      const info: JobSchedulerInfo = {
        timestamp: Date.now(),
        packageName: filterPackage,
        jobs: [],
      };

      const lines = output.split('\n');
      let currentJob: Partial<ScheduledJob> | null = null;

      for (const line of lines) {
        const trimmed = line.trim();

        // Parse JOB block: JOB #u0aXXX/ID: ...
        const jobMatch = trimmed.match(/JOB\s+#([^/]+)\/(\d+)/);
        if (jobMatch) {
          // Save previous job
          if (currentJob && currentJob.jobId !== undefined) {
            info.jobs.push(this.finalizeJob(currentJob));
          }

          currentJob = {
            packageName: '',
            serviceName: '',
            jobId: parseInt(jobMatch[2], 10),
            state: 'pending',
            constraints: {
              requiresCharging: false,
              requiresDeviceIdle: false,
              requiresNetwork: 'none',
              requiresBatteryNotLow: false,
              requiresStorageNotLow: false,
            },
            timing: {},
            isPersisted: false,
          };
        }

        if (currentJob) {
          // Parse service/package: Service: com.example/.JobService
          const serviceMatch = trimmed.match(/Service:\s*([^\s]+)/);
          if (serviceMatch) {
            const fullService = serviceMatch[1];
            if (fullService.includes('/')) {
              const parts = fullService.split('/');
              currentJob.packageName = parts[0];
              currentJob.serviceName = parts[1].startsWith('.')
                ? parts[1].substring(1)
                : parts[1];
            } else {
              currentJob.serviceName = fullService;
            }
          }

          // Parse state
          if (trimmed.includes('state=active') || trimmed.includes('Active:')) {
            currentJob.state = 'active';
          } else if (trimmed.includes('state=ready') || trimmed.includes('Ready')) {
            currentJob.state = 'ready';
          } else if (trimmed.includes('state=waiting') || trimmed.includes('Waiting')) {
            currentJob.state = 'waiting';
          }

          // Parse constraints
          if (trimmed.includes('Requires: charging=true') || trimmed.includes('requiresCharging=true')) {
            currentJob.constraints!.requiresCharging = true;
          }
          if (trimmed.includes('Requires: idle=true') || trimmed.includes('requiresDeviceIdle=true')) {
            currentJob.constraints!.requiresDeviceIdle = true;
          }
          if (trimmed.includes('Requires: batteryNotLow=true') || trimmed.includes('requiresBatteryNotLow=true')) {
            currentJob.constraints!.requiresBatteryNotLow = true;
          }
          if (trimmed.includes('Requires: storageNotLow=true') || trimmed.includes('requiresStorageNotLow=true')) {
            currentJob.constraints!.requiresStorageNotLow = true;
          }

          // Parse network requirement
          if (trimmed.includes('network=any') || trimmed.includes('Network type: any')) {
            currentJob.constraints!.requiresNetwork = 'any';
          } else if (trimmed.includes('network=unmetered') || trimmed.includes('Network type: unmetered')) {
            currentJob.constraints!.requiresNetwork = 'unmetered';
          } else if (trimmed.includes('network=cellular') || trimmed.includes('Network type: cellular')) {
            currentJob.constraints!.requiresNetwork = 'cellular';
          }

          // Parse timing
          const intervalMatch = trimmed.match(/Periodic:\s*interval=(\d+)/);
          if (intervalMatch) {
            currentJob.timing!.periodicInterval = parseInt(intervalMatch[1], 10);
          }

          const latencyMatch = trimmed.match(/Min latency:\s*(\d+)/);
          if (latencyMatch) {
            currentJob.timing!.minLatency = parseInt(latencyMatch[1], 10);
          }

          // Parse persisted
          if (trimmed.includes('persisted=true') || trimmed.includes('Persisted: true')) {
            currentJob.isPersisted = true;
          }
        }
      }

      // Add last job
      if (currentJob && currentJob.jobId !== undefined) {
        info.jobs.push(this.finalizeJob(currentJob));
      }

      // Filter by package if specified
      if (filterPackage) {
        info.jobs = info.jobs.filter(j => j.packageName === filterPackage);
      }

      return info;
    } catch (error) {
      console.error('Error parsing scheduled jobs:', error);
      return null;
    }
  }

  private finalizeJob(partial: Partial<ScheduledJob>): ScheduledJob {
    return {
      jobId: partial.jobId || 0,
      packageName: partial.packageName || 'Unknown',
      serviceName: partial.serviceName || 'Unknown',
      state: partial.state || 'pending',
      constraints: partial.constraints || {
        requiresCharging: false,
        requiresDeviceIdle: false,
        requiresNetwork: 'none',
        requiresBatteryNotLow: false,
        requiresStorageNotLow: false,
      },
      timing: partial.timing || {},
      isPersisted: partial.isPersisted || false,
    };
  }

  // ==================== Alarm Monitor ====================

  async getScheduledAlarms(deviceId: string, packageName?: string): Promise<AlarmMonitorInfo | null> {
    try {
      const cmd = packageName
        ? `adb -s ${deviceId} shell dumpsys alarm ${packageName}`
        : `adb -s ${deviceId} shell dumpsys alarm`;

      const { stdout } = await execAsync(cmd);
      return this.parseScheduledAlarms(stdout, packageName);
    } catch (error) {
      console.error('Error getting scheduled alarms:', error);
      return null;
    }
  }

  private parseScheduledAlarms(output: string, filterPackage?: string): AlarmMonitorInfo | null {
    try {
      const info: AlarmMonitorInfo = {
        timestamp: Date.now(),
        packageName: filterPackage,
        alarms: [],
      };

      const lines = output.split('\n');
      let currentAlarm: Partial<ScheduledAlarm> | null = null;
      let alarmIndex = 0;

      for (const line of lines) {
        const trimmed = line.trim();

        // Parse next alarm time
        const nextAlarmMatch = trimmed.match(/Next\s+(?:non-wakeup\s+)?alarm:\s*(\d+)/);
        if (nextAlarmMatch) {
          info.nextAlarmTime = parseInt(nextAlarmMatch[1], 10);
        }

        // Parse Alarm block - various formats
        // RTC_WAKEUP #0: Alarm{xxx type 0 ...}
        // or Batch{...} containing alarms
        const typeMatch = trimmed.match(/(RTC_WAKEUP|RTC|ELAPSED_REALTIME_WAKEUP|ELAPSED_REALTIME)/);
        const alarmMatch = trimmed.match(/Alarm\{([^}]+)\}/);

        if (typeMatch || alarmMatch) {
          // Save previous alarm
          if (currentAlarm && currentAlarm.packageName) {
            info.alarms.push(this.finalizeAlarm(currentAlarm, alarmIndex++));
          }

          currentAlarm = {
            packageName: '',
            type: (typeMatch?.[1] as ScheduledAlarm['type']) || 'RTC',
            triggerTime: 0,
            operation: '',
            isExact: false,
            isRepeating: false,
          };

          // Check for exact alarm indicator
          if (trimmed.includes('STANDALONE') || trimmed.includes('EXACT') || trimmed.includes('WAKEUP')) {
            currentAlarm.isExact = true;
          }
        }

        if (currentAlarm) {
          // Parse package from operation: PendingIntent{xxx: PendingIntentRecord{xxx com.example ...}}
          const packageMatch = trimmed.match(/PendingIntentRecord\{[^\s]+\s+([^\s]+)\s/);
          if (packageMatch) {
            currentAlarm.packageName = packageMatch[1];
          }

          // Alternative package parsing: operation=PendingIntent{...}
          const opPackageMatch = trimmed.match(/operation=.*?([a-zA-Z][a-zA-Z0-9_.]+)\//);
          if (opPackageMatch) {
            currentAlarm.packageName = opPackageMatch[1];
          }

          // Parse when trigger time: when=+XXXms or triggerTime=XXXXXX
          const whenMatch = trimmed.match(/when=([^\s,]+)/);
          if (whenMatch) {
            const whenStr = whenMatch[1];
            if (whenStr.startsWith('+')) {
              // Relative time, convert to absolute
              const msMatch = whenStr.match(/\+(\d+)(?:ms)?/);
              if (msMatch) {
                currentAlarm.triggerTime = Date.now() + parseInt(msMatch[1], 10);
              }
            } else {
              currentAlarm.triggerTime = parseInt(whenStr, 10);
            }
          }

          const triggerMatch = trimmed.match(/triggerTime=(\d+)/);
          if (triggerMatch) {
            currentAlarm.triggerTime = parseInt(triggerMatch[1], 10);
          }

          // Parse repeat interval
          const repeatMatch = trimmed.match(/repeatInterval=(\d+)/);
          if (repeatMatch) {
            const interval = parseInt(repeatMatch[1], 10);
            if (interval > 0) {
              currentAlarm.repeatInterval = interval;
              currentAlarm.isRepeating = true;
            }
          }

          // Parse operation/tag
          const tagMatch = trimmed.match(/tag=([^\s,}]+)/);
          if (tagMatch) {
            currentAlarm.tag = tagMatch[1];
          }

          // Parse operation string
          const operationMatch = trimmed.match(/operation=([^\s}]+)/);
          if (operationMatch) {
            currentAlarm.operation = operationMatch[1];
          }
        }
      }

      // Add last alarm
      if (currentAlarm && currentAlarm.packageName) {
        info.alarms.push(this.finalizeAlarm(currentAlarm, alarmIndex));
      }

      // Filter by package if specified
      if (filterPackage) {
        info.alarms = info.alarms.filter(a => a.packageName === filterPackage);
      }

      return info;
    } catch (error) {
      console.error('Error parsing scheduled alarms:', error);
      return null;
    }
  }

  private finalizeAlarm(partial: Partial<ScheduledAlarm>, index: number): ScheduledAlarm {
    return {
      id: `alarm-${index}-${Date.now()}`,
      packageName: partial.packageName || 'Unknown',
      type: partial.type || 'RTC',
      triggerTime: partial.triggerTime || 0,
      repeatInterval: partial.repeatInterval,
      operation: partial.operation || '',
      tag: partial.tag,
      isExact: partial.isExact || false,
      isRepeating: partial.isRepeating || false,
    };
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

      const flagStr = flags.length > 0 ? flags.join(' ') + ' ' : '';
      const cmd = `adb -s ${deviceId} install ${flagStr}"${apkPath}"`;

      onProgress?.({ stage: 'installing', percent: 50, message: 'Installing APK...' });

      const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
      const output = stdout + stderr;

      // Parse result
      if (output.includes('Success')) {
        // Try to extract package name from APK
        let packageName: string | undefined;
        try {
          const { stdout: aapt } = await execAsync(`adb -s ${deviceId} shell pm path $(aapt2 dump badging "${apkPath}" 2>/dev/null | grep "package: name=" | sed "s/.*name='\\([^']*\\)'.*/\\1/")`, { timeout: 10000 });
          packageName = aapt.trim().split('\n')[0]?.replace('package:', '');
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

      const flagStr = flags.length > 0 ? flags.join(' ') + ' ' : '';
      const apkPathsStr = apkPaths.map(p => `"${p}"`).join(' ');
      const cmd = `adb -s ${deviceId} install-multiple ${flagStr}${apkPathsStr}`;

      onProgress?.({ stage: 'installing', percent: 50, message: 'Installing APKs...' });

      const { stdout, stderr } = await execAsync(cmd, { timeout: 180000 });
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
      const { stdout } = await execAsync(`adb -s ${deviceId} shell getprop ro.product.cpu.abilist`);
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
      const { stdout } = await execAsync(`adb -s ${deviceId} shell getprop ro.sf.lcd_density`);
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
      const { stdout } = await execAsync(`adb -s ${deviceId} shell getprop ro.build.version.sdk`);
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
      await execAsync('java -version');
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
      await execAsync(`curl -L -o "${bundletoolPath}" "${BUNDLETOOL_URL}"`, { timeout: 300000 });

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
            await execAsync(
              `keytool -genkey -v -keystore "${debugKeystorePath}" -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"`,
              { timeout: 30000 }
            );
          } catch (e) {
            console.error('Failed to create debug keystore:', e);
            // Continue without keystore - let bundletool handle it
          }
        }

        let buildCmd = `java -jar "${bundletoolPath}" build-apks --bundle="${aabPath}" --output="${apksPath}" --connected-device --device-id=${deviceId} --local-testing`;

        // Use debug keystore for signing (required for installation)
        if (fs.existsSync(debugKeystorePath)) {
          buildCmd += ` --ks="${debugKeystorePath}" --ks-pass=pass:android --ks-key-alias=androiddebugkey --key-pass=pass:android`;
        }

        await execAsync(buildCmd, { timeout: 300000 }); // 5 min timeout for build

        // Extract the APKs from the .apks archive and install via ADB directly
        // This is more reliable than bundletool install-apks for debug builds
        onProgress?.({ stage: 'installing', percent: 60, message: 'Extracting APKs...' });

        const extractDir = path.join(tempDir, 'extracted');
        fs.mkdirSync(extractDir, { recursive: true });

        // Unzip the .apks file (it's a ZIP archive)
        await execAsync(`unzip -o "${apksPath}" -d "${extractDir}"`, { timeout: 60000 });

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

      // Get thread list from /proc/<pid>/task
      const { stdout: taskList } = await execAsync(
        `adb -s ${deviceId} shell ls /proc/${pid}/task`
      );

      const threadIds = taskList.trim().split('\n').filter(Boolean).map(t => parseInt(t.trim(), 10));
      const threads: ThreadInfo[] = [];

      // Get info for each thread
      for (const tid of threadIds) {
        try {
          const [statResult, commResult] = await Promise.all([
            execAsync(`adb -s ${deviceId} shell cat /proc/${pid}/task/${tid}/stat`).catch(() => ({ stdout: '' })),
            execAsync(`adb -s ${deviceId} shell cat /proc/${pid}/task/${tid}/comm`).catch(() => ({ stdout: '' })),
          ]);

          const stat = statResult.stdout.trim();
          const comm = commResult.stdout.trim();

          if (stat) {
            const threadInfo = this.parseThreadStat(tid, stat, comm);
            if (threadInfo) {
              threads.push(threadInfo);
            }
          }
        } catch {
          // Skip threads that can't be read
        }
      }

      return {
        timestamp: Date.now(),
        threads,
      };
    } catch (error) {
      console.error('Error getting threads:', error);
      return null;
    }
  }

  private parseThreadStat(tid: number, stat: string, comm: string): ThreadInfo | null {
    try {
      // /proc/[pid]/task/[tid]/stat format:
      // pid (comm) state ppid pgrp session tty_nr tpgid flags minflt cminflt majflt cmajflt utime stime...
      const match = stat.match(/^\d+\s+\(([^)]+)\)\s+(\S)\s+.+/);
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
      const fields = stat.split(/\s+/);
      const utime = parseInt(fields[13], 10) || 0;  // User mode jiffies
      const stime = parseInt(fields[14], 10) || 0;  // Kernel mode jiffies
      const cpuTime = (utime + stime) / 100;  // Convert jiffies to seconds (approximate)

      const priority = parseInt(fields[17], 10) || 0;

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

    this.threadMonitorInterval = setInterval(async () => {
      const snapshot = await this.getThreads(deviceId, packageName);
      if (snapshot) {
        callback(snapshot);
      }
    }, interval);
  }

  stopThreadMonitor(): void {
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

    if (!deviceId) {
      return;
    }

    // Monitor GC events via logcat filtering for ART/Dalvik GC messages
    this.gcMonitorProcess = spawn('adb', [
      '-s', deviceId,
      'logcat',
      '-s',
      'art:D',
      'dalvikvm:D',
      'dalvikvm-heap:D',
    ]);

    let buffer = '';

    this.gcMonitorProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const gcEvent = this.parseGcLogLine(line, packageName);
        if (gcEvent) {
          callback(gcEvent);
        }
      }
    });

    this.gcMonitorProcess.on('error', (error) => {
      console.error('GC monitor process error:', error);
    });
  }

  private parseGcLogLine(line: string, packageName: string): GcEvent | null {
    try {
      // Check if line is from our app (optional - might want all GC events)
      // ART GC format examples:
      // Background concurrent copying GC freed 12K(1%), AllocSpace 4MB/6MB, LOS 2MB, Paused 3ms
      // Explicit concurrent copying GC freed 2048K, 42% free 3584K/6144K, paused 2ms+1ms

      // Pattern for ART GC logs
      const artMatch = line.match(
        /(\w+)\s+(?:concurrent\s+)?(?:copying\s+)?GC\s+freed\s+([\d.]+)([KMG]?)(?:\([\d.]+%\))?,?\s*(?:AllocSpace\s+)?([\d.]+)([KMG]?)\/([\d.]+)([KMG]?).*?(?:[Pp]aused?\s+([\d.]+)\s*ms)?/i
      );

      if (artMatch) {
        const [, reason, freedStr, freedUnit, usedStr, usedUnit, totalStr, totalUnit, pauseStr] = artMatch;

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
    switch (unit.toUpperCase()) {
      case 'K': return num * 1024;
      case 'M': return num * 1024 * 1024;
      case 'G': return num * 1024 * 1024 * 1024;
      default: return num;
    }
  }

  private parseGcReason(reason: string): GcReason {
    const upper = reason.toUpperCase();
    if (upper.includes('ALLOC') || upper === 'FOR_ALLOC') return 'FOR_ALLOC';
    if (upper.includes('CONCURRENT') || upper === 'CONC') return 'CONCURRENT';
    if (upper.includes('EXPLICIT')) return 'EXPLICIT';
    if (upper.includes('BACKGROUND') || upper === 'BG') return 'BACKGROUND';
    return 'UNKNOWN';
  }

  stopGcMonitor(): void {
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
      await execAsync(
        `adb -s ${deviceId} shell am dumpheap ${pid} ${remotePath}`,
        { timeout: 120000 }
      );

      // Wait for dump to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      onProgress?.('capturing', 60);

      // Pull the file
      await execAsync(
        `adb -s ${deviceId} pull ${remotePath} "${localPath}"`,
        { timeout: 300000 }
      );

      onProgress?.('capturing', 90);

      // Clean up remote file
      await execAsync(`adb -s ${deviceId} shell rm ${remotePath}`).catch(() => {});

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
    // HPROF parsing is complex - this is a simplified implementation
    // For production use, consider using a proper HPROF parser library
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const buffer = fs.readFileSync(filePath);
      return this.parseHprof(buffer);
    } catch (error) {
      console.error('Error analyzing heap dump:', error);
      return null;
    }
  }

  private parseHprof(buffer: Buffer): HeapAnalysis | null {
    try {
      // HPROF format: header + records
      // Header: "JAVA PROFILE 1.0.3\0" or similar + identifier size (4 bytes) + timestamp (8 bytes)

      // Check magic
      const header = buffer.slice(0, 18).toString('utf8');
      if (!header.startsWith('JAVA PROFILE')) {
        console.error('Invalid HPROF file');
        return null;
      }

      // Find null terminator
      let headerEnd = 0;
      while (headerEnd < 30 && buffer[headerEnd] !== 0) {
        headerEnd++;
      }

      const idSize = buffer.readUInt32BE(headerEnd + 1);
      // const timestamp = buffer.readBigUInt64BE(headerEnd + 5);

      let offset = headerEnd + 1 + 4 + 8; // After header + id size + timestamp

      const classes = new Map<number, { name: string; instanceCount: number; shallowSize: number }>();
      const strings = new Map<number, string>();
      let totalObjects = 0;
      let totalSize = 0;

      // Parse records
      while (offset < buffer.length - 9) {
        const tag = buffer[offset];
        // const time = buffer.readUInt32BE(offset + 1);
        const length = buffer.readUInt32BE(offset + 5);
        offset += 9;

        if (offset + length > buffer.length) break;

        const recordData = buffer.slice(offset, offset + length);

        switch (tag) {
          case 0x01: // STRING
            {
              const stringId = idSize === 4
                ? recordData.readUInt32BE(0)
                : Number(recordData.readBigUInt64BE(0));
              const str = recordData.slice(idSize).toString('utf8');
              strings.set(stringId, str);
            }
            break;

          case 0x02: // LOAD_CLASS
            {
              // Class serial, class object ID, stack trace serial, class name string ID
              const classObjId = idSize === 4
                ? recordData.readUInt32BE(4)
                : Number(recordData.readBigUInt64BE(4));
              const classNameId = idSize === 4
                ? recordData.readUInt32BE(4 + idSize + 4)
                : Number(recordData.readBigUInt64BE(4 + idSize + 4));

              const className = strings.get(classNameId) || `Class@${classObjId}`;
              classes.set(classObjId, { name: className, instanceCount: 0, shallowSize: 0 });
            }
            break;

          case 0x0C: // HEAP_DUMP
          case 0x1C: // HEAP_DUMP_SEGMENT
            {
              // Parse heap dump records
              let heapOffset = 0;
              while (heapOffset < length - 1) {
                const heapTag = recordData[heapOffset];
                heapOffset++;

                if (heapTag === 0x21) { // INSTANCE_DUMP
                  // object ID, stack trace serial, class object ID, data length, data
                  const classId = idSize === 4
                    ? recordData.readUInt32BE(heapOffset + idSize + 4)
                    : Number(recordData.readBigUInt64BE(heapOffset + idSize + 4));
                  const dataLen = recordData.readUInt32BE(heapOffset + idSize + 4 + idSize);

                  totalObjects++;
                  totalSize += dataLen;

                  const classInfo = classes.get(classId);
                  if (classInfo) {
                    classInfo.instanceCount++;
                    classInfo.shallowSize += dataLen;
                  }

                  heapOffset += idSize + 4 + idSize + 4 + dataLen;
                } else {
                  // Skip other heap record types - this is simplified
                  break;
                }
              }
            }
            break;
        }

        offset += length;
      }

      // Convert to HeapClass array
      const classArray: HeapClass[] = Array.from(classes.entries())
        .map(([id, info]) => ({
          id,
          name: info.name.replace(/\//g, '.'),
          instanceCount: info.instanceCount,
          shallowSize: info.shallowSize,
          retainedSize: info.shallowSize, // Simplified - retained size calculation is complex
        }))
        .filter(c => c.instanceCount > 0)
        .sort((a, b) => b.shallowSize - a.shallowSize);

      return {
        totalObjects,
        totalSize,
        classes: classArray.slice(0, 500), // Limit to top 500 classes
      };
    } catch (error) {
      console.error('Error parsing HPROF:', error);
      return null;
    }
  }

  async getHeapInstances(filePath: string, classId: number): Promise<HeapInstance[]> {
    // Simplified - in a full implementation, this would parse the HPROF file
    // and return instances of the specified class
    return [];
  }

  // ==================== Method Trace ====================

  async startMethodTrace(
    deviceId: string,
    packageName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if app is debuggable
      const metadata = await this.getAppMetadata(deviceId, packageName);
      if (!metadata?.isDebuggable) {
        return { success: false, error: 'App must be debuggable to capture method trace' };
      }

      // Start profiling
      await execAsync(
        `adb -s ${deviceId} shell am profile start ${packageName} /data/local/tmp/trace.trace`,
        { timeout: 10000 }
      );

      this.methodTraceActive = true;
      this.methodTraceStartTime = Date.now();

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async stopMethodTrace(
    deviceId: string,
    packageName: string
  ): Promise<MethodTraceInfo> {
    const id = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const remotePath = '/data/local/tmp/trace.trace';
    const localPath = path.join(os.tmpdir(), `${id}.trace`);

    try {
      if (!this.methodTraceActive) {
        return {
          id,
          timestamp: Date.now(),
          duration: 0,
          status: 'error',
          error: 'No trace is active',
        };
      }

      const duration = Date.now() - this.methodTraceStartTime;
      this.methodTraceActive = false;

      // Stop profiling
      await execAsync(
        `adb -s ${deviceId} shell am profile stop ${packageName}`,
        { timeout: 10000 }
      );

      // Wait for trace to be written
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Pull the trace file
      await execAsync(
        `adb -s ${deviceId} pull ${remotePath} "${localPath}"`,
        { timeout: 60000 }
      );

      // Clean up remote file
      await execAsync(`adb -s ${deviceId} shell rm ${remotePath}`).catch(() => {});

      return {
        id,
        timestamp: Date.now(),
        duration,
        filePath: localPath,
        status: 'ready',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.methodTraceActive = false;
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

      const buffer = fs.readFileSync(filePath);
      return this.parseTrace(buffer);
    } catch (error) {
      console.error('Error analyzing method trace:', error);
      return null;
    }
  }

  private parseTrace(buffer: Buffer): MethodTraceAnalysis | null {
    try {
      // Android trace format:
      // Header section with method names
      // Binary section with trace data

      // Find the header end (marked by *end)
      const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024 * 1024));
      const headerEnd = content.indexOf('*end');
      if (headerEnd === -1) {
        return null;
      }

      const header = content.slice(0, headerEnd);
      const lines = header.split('\n');

      const methods = new Map<number, { className: string; methodName: string }>();
      const methodStats = new Map<number, { inclusive: number; exclusive: number; count: number }>();

      // Parse method definitions from header
      let inMethods = false;
      for (const line of lines) {
        if (line.startsWith('*methods')) {
          inMethods = true;
          continue;
        }
        if (line.startsWith('*')) {
          inMethods = false;
          continue;
        }

        if (inMethods && line.trim()) {
          // Format: methodId className methodName signature
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const methodId = parseInt(parts[0], 16);
            const className = parts[1];
            const methodName = parts[2];
            methods.set(methodId, { className, methodName });
            methodStats.set(methodId, { inclusive: 0, exclusive: 0, count: 0 });
          }
        }
      }

      // Parse binary trace data (simplified)
      // Full implementation would parse the binary section to calculate actual timings
      // For now, return placeholder data based on method definitions

      const result: MethodStats[] = [];
      for (const [methodId, info] of methods) {
        const stats = methodStats.get(methodId);
        result.push({
          className: info.className,
          methodName: info.methodName,
          inclusiveTime: stats?.inclusive || 0,
          exclusiveTime: stats?.exclusive || 0,
          callCount: stats?.count || 1,
        });
      }

      // Sort by inclusive time
      result.sort((a, b) => b.inclusiveTime - a.inclusiveTime);

      // Build a simple flame chart
      const flameChart: FlameChartEntry = {
        name: 'root',
        value: result.reduce((sum, m) => sum + m.exclusiveTime, 0),
        children: result.slice(0, 100).map(m => ({
          name: `${m.className}.${m.methodName}`,
          value: m.exclusiveTime,
        })),
      };

      return {
        totalTime: flameChart.value,
        methods: result.slice(0, 500),
        flameChart,
      };
    } catch (error) {
      console.error('Error parsing trace:', error);
      return null;
    }
  }

  stopAll(): void {
    this.stopMemoryMonitor();
    this.stopCpuMonitor();
    this.stopFpsMonitor();
    this.stopLogcat();
    this.stopBatteryMonitor();
    this.stopCrashLogcat();
    this.stopNetworkStatsMonitor();
    this.stopThreadMonitor();
    this.stopGcMonitor();
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGINT');
      this.recordingProcess = null;
      this.recordingPath = null;
    }
  }
}

export const adbService = new AdbService();
