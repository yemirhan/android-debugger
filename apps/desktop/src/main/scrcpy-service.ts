import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import type { ScrcpyConfig, ScrcpyState } from '@android-debugger/shared';

const execAsync = promisify(exec);

const SCRCPY_VERSION = '3.1';

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
      const { stdout } = await execAsync(`"${scrcpyPath}" --version`);
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
      await execAsync(`curl -L -o "${archivePath}" "${SCRCPY_URL}"`, { timeout: 300000 });

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

      // Extract the archive
      // The archive contains a folder like scrcpy-macos-aarch64-v3.1/
      await execAsync(`tar -xzf "${archivePath}" -C "${this.scrcpyDir}"`, { timeout: 60000 });

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
  startMirror(deviceId: string, config: ScrcpyConfig = {}): { success: boolean; error?: string } {
    const scrcpyPath = this.getScrcpyPath();
    if (!scrcpyPath) {
      return { success: false, error: 'scrcpy not found. Please download it first.' };
    }

    // Stop existing mirror if running
    if (this.scrcpyProcess) {
      this.stopMirror();
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

      this.scrcpyProcess = spawn(scrcpyPath, args, {
        env,
        cwd: scrcpyDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.currentDeviceId = deviceId;

      this.scrcpyProcess.on('error', (error) => {
        console.error('[Scrcpy] Process error:', error);
        this.notifyStateChange({
          isRunning: false,
          deviceId: null,
          pid: null,
          error: error.message,
        });
        this.scrcpyProcess = null;
        this.currentDeviceId = null;
      });

      this.scrcpyProcess.on('exit', (code, signal) => {
        console.log(`[Scrcpy] Process exited with code ${code}, signal ${signal}`);
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
      this.scrcpyProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
          console.log('[Scrcpy stderr]', message);
        }
      });

      // Notify that mirroring started
      this.notifyStateChange({
        isRunning: true,
        deviceId,
        pid: this.scrcpyProcess.pid || null,
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
  stopMirror(): void {
    if (this.scrcpyProcess) {
      this.scrcpyProcess.kill('SIGTERM');
      // Force kill after timeout
      setTimeout(() => {
        if (this.scrcpyProcess) {
          this.scrcpyProcess.kill('SIGKILL');
        }
      }, 2000);
    }
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
