import { spawn, execFile, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { promisify } from 'util';
import type { ScrcpyConfig, ScrcpyState } from '@android-debugger/shared';

const execFileAsync = promisify(execFile);

const SCRCPY_VERSION = '3.1';
const SCRCPY_SHA256: Record<'arm64' | 'x64', string> = {
  arm64: '478618d940421e5f57942f5479d493ecbb38210682937a200f712aee5f235daf',
  x64: 'acde98e29c273710ffa469371dbca4a728a44c41c380381f8a54e5b5301b9e87',
};

class ScrcpyService {
  private scrcpyDir: string = '';
  private scrcpyProcess: ChildProcess | null = null;
  private currentDeviceId: string | null = null;
  private onStateChange: ((state: ScrcpyState) => void) | null = null;

  /**
   * Set the directory for scrcpy storage (called from main process with app.getPath('userData'))
   */
  setScrcpyDir(dir: string): void {
    this.scrcpyDir = dir;
  }

  /**
   * Set callback for state changes
   */
  onState(callback: (state: ScrcpyState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Get the path to scrcpy binary
   * Checks userData directory where scrcpy is downloaded on-demand
   */
  getScrcpyPath(): string {
    // Primary location: userData directory (downloaded on-demand)
    if (this.scrcpyDir) {
      const userDataPath = path.join(this.scrcpyDir, 'scrcpy', 'scrcpy');
      if (fs.existsSync(userDataPath)) {
        return userDataPath;
      }
    }

    // Fallback: check if scrcpy is in PATH (system-installed)
    // This is checked synchronously for simplicity
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const scrcpyPath = path.join(dir, 'scrcpy');
      if (fs.existsSync(scrcpyPath)) {
        return scrcpyPath;
      }
    }

    return '';
  }

  /**
   * Check if scrcpy is available
   */
  isScrcpyAvailable(): boolean {
    return !!this.getScrcpyPath();
  }

  /**
   * Check if scrcpy needs to be downloaded
   */
  needsScrcpyDownload(): boolean {
    return !this.getScrcpyPath();
  }

  /**
   * Get scrcpy info (path and version)
   */
  async getScrcpyInfo(): Promise<{ path: string; version: string } | null> {
    const scrcpyPath = this.getScrcpyPath();
    if (!scrcpyPath) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(scrcpyPath, ['--version'], { encoding: 'utf8' });
      // Extract version from output (e.g., "scrcpy 3.1")
      const versionMatch = stdout.match(/scrcpy\s+([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      return { path: scrcpyPath, version };
    } catch {
      return { path: scrcpyPath, version: 'unknown' };
    }
  }

  /**
   * Download scrcpy to userData directory
   */
  async downloadScrcpy(onProgress?: (percent: number, message: string) => void): Promise<{ success: boolean; error?: string }> {
    // Determine platform and architecture
    const platform = os.platform();
    const arch = os.arch();

    if (platform !== 'darwin') {
      return { success: false, error: 'Only macOS is currently supported for automatic scrcpy download' };
    }
    if (arch !== 'arm64' && arch !== 'x64') {
      return { success: false, error: `Unsupported macOS architecture: ${arch}` };
    }

    // Determine the correct archive URL based on architecture
    const archSuffix = arch === 'arm64' ? 'aarch64' : 'x86_64';
    const archiveName = `scrcpy-macos-${archSuffix}-v${SCRCPY_VERSION}.tar.gz`;
    const SCRCPY_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/${archiveName}`;

    if (!this.scrcpyDir) {
      return { success: false, error: 'Scrcpy directory not set' };
    }

    const scrcpyDir = path.join(this.scrcpyDir, 'scrcpy');
    const archivePath = path.join(this.scrcpyDir, archiveName);

    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(scrcpyDir)) {
        fs.mkdirSync(scrcpyDir, { recursive: true });
      }

      onProgress?.(5, 'Starting download...');

      // Download using curl (available on macOS)
      await execFileAsync('curl', ['--fail', '--location', '--output', archivePath, SCRCPY_URL], { timeout: 300000 });

      onProgress?.(60, 'Extracting...');

      // Verify the file exists
      if (!fs.existsSync(archivePath)) {
        return { success: false, error: 'Download failed - file not found' };
      }

      const stats = fs.statSync(archivePath);
      if (stats.size < 1000000) { // Should be at least 1MB
        fs.unlinkSync(archivePath);
        return { success: false, error: 'Download failed - file too small' };
      }
      const digest = createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
      if (digest !== SCRCPY_SHA256[arch]) {
        throw new Error('Downloaded scrcpy archive failed SHA-256 verification');
      }

      // Extract the archive
      // The archive contains a folder like scrcpy-macos-aarch64-v3.1/
      const { stdout: archiveEntries } = await execFileAsync('tar', ['-tzf', archivePath], {
        encoding: 'utf8',
        timeout: 60000,
      });
      const unsafeEntry = archiveEntries.split('\n').find((entry) =>
        entry.startsWith('/') || entry.split('/').includes('..')
      );
      if (unsafeEntry) {
        throw new Error('Downloaded scrcpy archive contains an unsafe path');
      }
      await execFileAsync('tar', ['-xzf', archivePath, '-C', this.scrcpyDir], { timeout: 60000 });

      onProgress?.(80, 'Setting up...');

      // Move contents from extracted folder to scrcpy directory
      const extractedFolderName = `scrcpy-macos-${archSuffix}-v${SCRCPY_VERSION}`;
      const extractedFolder = path.join(this.scrcpyDir, extractedFolderName);

      if (fs.existsSync(extractedFolder)) {
        // Move all files from extracted folder to scrcpy dir
        const files = fs.readdirSync(extractedFolder);
        for (const file of files) {
          const srcPath = path.join(extractedFolder, file);
          const destPath = path.join(scrcpyDir, file);
          // Remove existing file/folder if exists
          if (fs.existsSync(destPath)) {
            fs.rmSync(destPath, { recursive: true });
          }
          fs.renameSync(srcPath, destPath);
        }
        // Remove the now-empty extracted folder
        fs.rmdirSync(extractedFolder);
      }

      // Make scrcpy executable
      const scrcpyBinary = path.join(scrcpyDir, 'scrcpy');
      if (fs.existsSync(scrcpyBinary)) {
        fs.chmodSync(scrcpyBinary, 0o755);
      }

      // Clean up archive
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }

      onProgress?.(90, 'Verifying installation...');

      // Verify scrcpy works
      const scrcpyPath = this.getScrcpyPath();
      if (!scrcpyPath) {
        return { success: false, error: 'Installation failed - scrcpy binary not found' };
      }

      onProgress?.(100, 'Download complete');
      return { success: true };
    } catch (error) {
      // Clean up partial download
      try {
        if (fs.existsSync(archivePath)) {
          fs.unlinkSync(archivePath);
        }
      } catch {
        // Ignore cleanup errors
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Start screen mirroring
   */
  async startMirror(deviceId: string, config: ScrcpyConfig = {}): Promise<{ success: boolean; error?: string }> {
    if (!deviceId || !/^[A-Za-z0-9._:-]+$/.test(deviceId)) {
      return { success: false, error: 'Invalid Android device ID' };
    }
    const scrcpyPath = this.getScrcpyPath();
    if (!scrcpyPath) {
      return { success: false, error: 'scrcpy not found. Please download it first.' };
    }

    // Stop existing mirror if running
    if (this.scrcpyProcess) {
      await this.stopMirror();
    }

    // Build command arguments
    const args: string[] = ['-s', deviceId];

    if (config.maxSize) {
      args.push('--max-size', config.maxSize.toString());
    }
    if (config.bitRate) {
      args.push('--video-bit-rate', `${config.bitRate}M`);
    }
    if (config.maxFps) {
      args.push('--max-fps', config.maxFps.toString());
    }
    if (config.showTouches) {
      args.push('--show-touches');
    }
    if (config.stayAwake) {
      args.push('--stay-awake');
    }
    if (config.turnScreenOff) {
      args.push('--turn-screen-off');
    }
    if (config.alwaysOnTop) {
      args.push('--always-on-top');
    }
    if (config.windowTitle) {
      args.push('--window-title', config.windowTitle);
    }

    try {
      // Set up environment to include the scrcpy directory for finding scrcpy-server
      const scrcpyDir = path.dirname(scrcpyPath);
      const env = {
        ...process.env,
        PATH: `${scrcpyDir}:${process.env.PATH || ''}`,
      };

      const child = spawn(scrcpyPath, args, {
        env,
        cwd: scrcpyDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.scrcpyProcess = child;

      this.currentDeviceId = deviceId;

      child.on('error', (error) => {
        console.error('[Scrcpy] Process error:', error);
        this.notifyStateChange({
          isRunning: false,
          deviceId: null,
          pid: null,
          error: error.message,
        });
        if (this.scrcpyProcess === child) {
          this.scrcpyProcess = null;
          this.currentDeviceId = null;
        }
      });

      child.on('exit', (code, signal) => {
        console.log(`[Scrcpy] Process exited with code ${code}, signal ${signal}`);
        if (this.scrcpyProcess !== child) return;
        this.notifyStateChange({
          isRunning: false,
          deviceId: null,
          pid: null,
          error: code !== 0 && code !== null ? `Process exited with code ${code}` : null,
        });
        this.scrcpyProcess = null;
        this.currentDeviceId = null;
      });

      // Log stderr for debugging
      child.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
          console.log('[Scrcpy stderr]', message);
        }
      });

      // Notify that mirroring started
      this.notifyStateChange({
        isRunning: true,
        deviceId,
        pid: child.pid || null,
        error: null,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Stop screen mirroring
   */
  async stopMirror(): Promise<void> {
    const process = this.scrcpyProcess;
    if (!process) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        resolve();
      };
      const forceKillTimer = setTimeout(() => {
        if (process.exitCode === null && process.signalCode === null) {
          process.kill('SIGKILL');
        }
        finish();
      }, 2000);
      process.once('exit', finish);
      process.kill('SIGTERM');
    });
  }

  /**
   * Get current mirroring state
   */
  getState(): ScrcpyState {
    return {
      isRunning: this.scrcpyProcess !== null,
      deviceId: this.currentDeviceId,
      pid: this.scrcpyProcess?.pid || null,
      error: null,
    };
  }

  /**
   * Check if mirroring a specific device
   */
  isMirroring(deviceId?: string): boolean {
    if (!this.scrcpyProcess) {
      return false;
    }
    if (deviceId) {
      return this.currentDeviceId === deviceId;
    }
    return true;
  }

  private notifyStateChange(state: ScrcpyState): void {
    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }
}

export const scrcpyService = new ScrcpyService();
