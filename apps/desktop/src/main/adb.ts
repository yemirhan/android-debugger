import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import type { Device, MemoryInfo, CpuInfo, FpsInfo, LogEntry, LogLevel } from '@android-debugger/shared';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

type LogCallback = (entry: LogEntry) => void;

export class AdbService {
  private logcatProcess: ChildProcess | null = null;
  private memoryInterval: NodeJS.Timeout | null = null;
  private cpuInterval: NodeJS.Timeout | null = null;
  private fpsInterval: NodeJS.Timeout | null = null;

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

  startLogcat(
    deviceId: string,
    callback: LogCallback,
    filters?: string[]
  ): void {
    this.stopLogcat();

    const defaultFilters = ['*:S', 'ReactNative:V', 'ReactNativeJS:V'];
    const logFilters = filters || defaultFilters;

    const args = ['-s', deviceId, 'logcat', '-v', 'time', ...logFilters];
    this.logcatProcess = spawn('adb', args);

    let buffer = '';

    this.logcatProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const entry = this.parseLogLine(line);
        if (entry) {
          callback(entry);
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

  stopAll(): void {
    this.stopMemoryMonitor();
    this.stopCpuMonitor();
    this.stopFpsMonitor();
    this.stopLogcat();
  }
}

export const adbService = new AdbService();
