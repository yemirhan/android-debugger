import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import type { UpdateSettings, UpdateInfo, UpdateProgress } from '@android-debugger/shared';

interface AdbInfo {
  path: string;
  version: string;
  source: 'bundled' | 'system' | 'android-sdk';
}

// Fix PATH for packaged app - add common ADB locations
function fixPath(): void {
  const homeDir = os.homedir();

  // Check for bundled ADB first (in packaged app)
  let bundledAdbPath: string | null = null;
  if (app.isPackaged) {
    bundledAdbPath = join(process.resourcesPath, 'platform-tools');
  } else {
    // In development, check local resources folder
    const devResourcesPath = join(__dirname, '../../resources/platform-tools');
    if (fs.existsSync(devResourcesPath)) {
      bundledAdbPath = devResourcesPath;
    }
  }

  const adbPaths = [
    ...(bundledAdbPath ? [bundledAdbPath] : []), // Bundled ADB first
    join(homeDir, 'Library/Android/sdk/platform-tools'), // macOS Android Studio default
    join(homeDir, 'Android/Sdk/platform-tools'), // Linux default
    '/usr/local/bin', // Homebrew
    '/opt/homebrew/bin', // Homebrew on Apple Silicon
  ];

  // Check ANDROID_HOME and ANDROID_SDK_ROOT
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (androidHome) {
    // Insert after bundled path but before other system paths
    const insertIndex = bundledAdbPath ? 1 : 0;
    adbPaths.splice(insertIndex, 0, join(androidHome, 'platform-tools'));
  }

  const existingPath = process.env.PATH || '';
  const pathsToAdd = adbPaths.filter(p => {
    try {
      return fs.existsSync(p) && !existingPath.includes(p);
    } catch {
      return false;
    }
  });

  if (pathsToAdd.length > 0) {
    process.env.PATH = [...pathsToAdd, existingPath].join(':');
  }
}

// Fix PATH before importing adb service
fixPath();

function getAdbInfo(): AdbInfo | null {
  const paths = process.env.PATH?.split(':') || [];

  for (const p of paths) {
    const adbPath = join(p, 'adb');
    if (fs.existsSync(adbPath)) {
      // Determine source
      let source: AdbInfo['source'] = 'system';
      if (app.isPackaged && p.includes(process.resourcesPath)) {
        source = 'bundled';
      } else if (p.includes('resources/platform-tools')) {
        source = 'bundled';
      } else if (p.includes('Android/sdk') || p.includes('Android/Sdk')) {
        source = 'android-sdk';
      }

      // Get version
      try {
        const version = execSync(`"${adbPath}" version`, { encoding: 'utf-8' })
          .split('\n')[0]
          .replace('Android Debug Bridge version ', '');
        return { path: adbPath, version, source };
      } catch {
        return { path: adbPath, version: 'unknown', source };
      }
    }
  }
  return null;
}

import { adbService } from './adb';
import type {
  LogEntry,
  MemoryInfo,
  CpuInfo,
  FpsInfo,
  SdkMessage,
  DeveloperOptions,
  IntentConfig,
  IntentHistoryEntry,
  BatteryInfo,
  CrashEntry,
  AppNetworkStats,
  ActivityStackInfo,
  JobSchedulerInfo,
  AlarmMonitorInfo,
  InstallOptions,
  InstallProgress,
} from '@android-debugger/shared';
import { MEMORY_POLL_INTERVAL, CPU_POLL_INTERVAL, FPS_POLL_INTERVAL, BATTERY_POLL_INTERVAL, NETWORK_STATS_POLL_INTERVAL } from '@android-debugger/shared';

// Storage for saved intents and history
const savedIntentsPath = join(app.getPath('userData'), 'saved-intents.json');
const intentHistoryPath = join(app.getPath('userData'), 'intent-history.json');
const updateSettingsPath = join(app.getPath('userData'), 'update-settings.json');

// Update settings management
function loadUpdateSettings(): UpdateSettings {
  try {
    if (fs.existsSync(updateSettingsPath)) {
      return JSON.parse(fs.readFileSync(updateSettingsPath, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading update settings:', error);
  }
  return { autoCheckOnStartup: true, autoDownload: false };
}

function saveUpdateSettings(settings: UpdateSettings): void {
  try {
    fs.writeFileSync(updateSettingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving update settings:', error);
  }
}

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function loadSavedIntents(): IntentConfig[] {
  try {
    if (fs.existsSync(savedIntentsPath)) {
      return JSON.parse(fs.readFileSync(savedIntentsPath, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading saved intents:', error);
  }
  return [];
}

function saveSavedIntents(intents: IntentConfig[]): void {
  try {
    fs.writeFileSync(savedIntentsPath, JSON.stringify(intents, null, 2));
  } catch (error) {
    console.error('Error saving intents:', error);
  }
}

function loadIntentHistory(): IntentHistoryEntry[] {
  try {
    if (fs.existsSync(intentHistoryPath)) {
      return JSON.parse(fs.readFileSync(intentHistoryPath, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading intent history:', error);
  }
  return [];
}

function saveIntentHistory(history: IntentHistoryEntry[]): void {
  try {
    // Keep only last 100 entries
    const trimmed = history.slice(-100);
    fs.writeFileSync(intentHistoryPath, JSON.stringify(trimmed, null, 2));
  } catch (error) {
    console.error('Error saving intent history:', error);
  }
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    title: isDev ? 'Android Debugger (Dev)' : 'Android Debugger',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpcHandlers(): void {
  // Device handlers
  ipcMain.handle('adb:get-devices', async () => {
    return adbService.getDevices();
  });

  ipcMain.handle('adb:get-device-info', async (_, deviceId: string) => {
    return adbService.getDeviceInfo(deviceId);
  });

  // Memory handlers
  ipcMain.handle('adb:get-meminfo', async (_, deviceId: string, packageName: string) => {
    return adbService.getMemInfo(deviceId, packageName);
  });

  ipcMain.on('adb:start-memory-monitor', (_, deviceId: string, packageName: string, interval?: number) => {
    adbService.startMemoryMonitor(
      deviceId,
      packageName,
      interval || MEMORY_POLL_INTERVAL,
      (info: MemoryInfo) => {
        mainWindow?.webContents.send('memory-update', info);
      }
    );
  });

  ipcMain.on('adb:stop-memory-monitor', () => {
    adbService.stopMemoryMonitor();
  });

  // Log handlers
  ipcMain.on('adb:start-logcat', async (_, deviceId: string, filters?: string[], packageName?: string) => {
    console.log('[Main] Starting logcat for device:', deviceId, 'packageName:', packageName);

    let pid: number | undefined;
    if (packageName) {
      const fetchedPid = await adbService.getPid(deviceId, packageName);
      if (fetchedPid) {
        pid = fetchedPid;
        console.log('[Main] Using PID filtering:', pid);
      } else {
        console.log('[Main] Could not get PID, falling back to filter-based logcat');
      }
    }

    adbService.startLogcat(
      deviceId,
      (entry: LogEntry) => {
        console.log('[Main] Sending log entry:', entry.tag, entry.message.substring(0, 50));
        mainWindow?.webContents.send('log-entry', entry);
      },
      filters,
      pid
    );
  });

  ipcMain.on('adb:stop-logcat', () => {
    adbService.stopLogcat();
  });

  ipcMain.handle('adb:clear-logcat', async (_, deviceId: string) => {
    return adbService.clearLogcat(deviceId);
  });

  // CPU handlers
  ipcMain.handle('adb:get-cpu', async (_, deviceId: string, packageName: string) => {
    return adbService.getCpuInfo(deviceId, packageName);
  });

  ipcMain.on('adb:start-cpu-monitor', (_, deviceId: string, packageName: string, interval?: number) => {
    adbService.startCpuMonitor(
      deviceId,
      packageName,
      interval || CPU_POLL_INTERVAL,
      (info: CpuInfo) => {
        mainWindow?.webContents.send('cpu-update', info);
      }
    );
  });

  ipcMain.on('adb:stop-cpu-monitor', () => {
    adbService.stopCpuMonitor();
  });

  // FPS handlers
  ipcMain.handle('adb:get-fps', async (_, deviceId: string, packageName: string) => {
    return adbService.getFpsInfo(deviceId, packageName);
  });

  ipcMain.on('adb:start-fps-monitor', (_, deviceId: string, packageName: string, interval?: number) => {
    adbService.startFpsMonitor(
      deviceId,
      packageName,
      interval || FPS_POLL_INTERVAL,
      (info: FpsInfo) => {
        mainWindow?.webContents.send('fps-update', info);
      }
    );
  });

  ipcMain.on('adb:stop-fps-monitor', () => {
    adbService.stopFpsMonitor();
  });

  // App management handlers
  ipcMain.handle('adb:get-packages', async (_, deviceId: string, debuggableOnly?: boolean) => {
    return adbService.getPackages(deviceId, debuggableOnly);
  });

  ipcMain.handle('adb:launch-app', async (_, deviceId: string, packageName: string) => {
    return adbService.launchApp(deviceId, packageName);
  });

  ipcMain.handle('adb:kill-app', async (_, deviceId: string, packageName: string) => {
    return adbService.killApp(deviceId, packageName);
  });

  ipcMain.handle('adb:clear-app-data', async (_, deviceId: string, packageName: string) => {
    return adbService.clearAppData(deviceId, packageName);
  });

  // SDK message forwarding - SDK messages are now parsed from logcat
  // and forwarded to the renderer automatically when logcat is running
  adbService.on('sdk-message', (message: SdkMessage) => {
    console.log('[Main] Received SDK message from ADB, forwarding to renderer:', message.type);
    mainWindow?.webContents.send('sdk-message', { message });
  });

  // App Metadata handlers
  ipcMain.handle('adb:get-app-metadata', async (_, deviceId: string, packageName: string) => {
    return adbService.getAppMetadata(deviceId, packageName);
  });

  // Screen Capture handlers
  ipcMain.handle('screen:take-screenshot', async (_, deviceId: string) => {
    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Screenshot',
      defaultPath: `screenshot_${Date.now()}.png`,
      filters: [{ name: 'PNG Images', extensions: ['png'] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return adbService.takeScreenshot(deviceId, result.filePath);
  });

  ipcMain.handle('screen:start-recording', async (_, deviceId: string) => {
    // Show save dialog first
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Recording',
      defaultPath: `recording_${Date.now()}.mp4`,
      filters: [{ name: 'MP4 Videos', extensions: ['mp4'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false };
    }

    return adbService.startScreenRecording(deviceId, result.filePath, (isRecording) => {
      mainWindow?.webContents.send('recording-update', {
        isRecording,
        outputPath: result.filePath,
      });
    });
  });

  ipcMain.handle('screen:stop-recording', async (_, deviceId: string) => {
    return adbService.stopScreenRecording(deviceId);
  });

  // Developer Options handlers
  ipcMain.handle('dev-options:get', async (_, deviceId: string) => {
    return adbService.getDeveloperOptions(deviceId);
  });

  ipcMain.handle('dev-options:set-layout-bounds', async (_, deviceId: string, enabled: boolean) => {
    return adbService.setLayoutBounds(deviceId, enabled);
  });

  ipcMain.handle('dev-options:set-gpu-overdraw', async (_, deviceId: string, mode: DeveloperOptions['gpuOverdraw']) => {
    return adbService.setGpuOverdraw(deviceId, mode);
  });

  ipcMain.handle('dev-options:set-animation-scale', async (_, deviceId: string, scale: number, type: 'window' | 'transition' | 'animator') => {
    return adbService.setAnimationScale(deviceId, scale, type);
  });

  ipcMain.handle('dev-options:set-show-touches', async (_, deviceId: string, enabled: boolean) => {
    return adbService.setShowTouches(deviceId, enabled);
  });

  ipcMain.handle('dev-options:set-pointer-location', async (_, deviceId: string, enabled: boolean) => {
    return adbService.setPointerLocation(deviceId, enabled);
  });

  // File Inspector handlers
  ipcMain.handle('files:list', async (_, deviceId: string, packageName: string, path: string) => {
    return adbService.listAppFiles(deviceId, packageName, path);
  });

  ipcMain.handle('files:read', async (_, deviceId: string, packageName: string, path: string) => {
    return adbService.readAppFile(deviceId, packageName, path);
  });

  ipcMain.handle('files:read-shared-prefs', async (_, deviceId: string, packageName: string) => {
    return adbService.readSharedPreferences(deviceId, packageName);
  });

  ipcMain.handle('files:list-databases', async (_, deviceId: string, packageName: string) => {
    return adbService.listDatabases(deviceId, packageName);
  });

  ipcMain.handle('files:query-database', async (_, deviceId: string, packageName: string, dbName: string, query: string) => {
    return adbService.queryDatabase(deviceId, packageName, dbName, query);
  });

  // Intent Tester handlers
  ipcMain.handle('intent:fire', async (_, deviceId: string, intent: IntentConfig) => {
    const result = await adbService.fireIntent(deviceId, intent);

    // Add to history
    const history = loadIntentHistory();
    history.push({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      intent,
      timestamp: Date.now(),
      success: result.success,
      error: result.error,
    });
    saveIntentHistory(history);

    return result;
  });

  ipcMain.handle('intent:fire-deep-link', async (_, deviceId: string, uri: string) => {
    const result = await adbService.fireDeepLink(deviceId, uri);

    // Add to history with a simple intent representation
    const history = loadIntentHistory();
    const deepLinkIntent: IntentConfig = {
      id: `deeplink-${Date.now()}`,
      name: 'Deep Link',
      action: 'android.intent.action.VIEW',
      data: uri,
      extras: [],
      flags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    history.push({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      intent: deepLinkIntent,
      timestamp: Date.now(),
      success: result.success,
      error: result.error,
    });
    saveIntentHistory(history);

    return result;
  });

  ipcMain.handle('intent:save', async (_, intent: IntentConfig) => {
    const intents = loadSavedIntents();
    const existingIndex = intents.findIndex((i) => i.id === intent.id);
    if (existingIndex >= 0) {
      intents[existingIndex] = intent;
    } else {
      intents.push(intent);
    }
    saveSavedIntents(intents);
  });

  ipcMain.handle('intent:get-saved', async () => {
    return loadSavedIntents();
  });

  ipcMain.handle('intent:delete-saved', async (_, id: string) => {
    const intents = loadSavedIntents();
    const filtered = intents.filter((i) => i.id !== id);
    saveSavedIntents(filtered);
  });

  ipcMain.handle('intent:get-history', async () => {
    return loadIntentHistory();
  });

  ipcMain.handle('intent:clear-history', async () => {
    saveIntentHistory([]);
  });

  // App info handlers
  ipcMain.handle('app:get-adb-info', async () => {
    return getAdbInfo();
  });

  // Battery handlers
  ipcMain.handle('adb:get-battery', async (_, deviceId: string) => {
    return adbService.getBatteryInfo(deviceId);
  });

  ipcMain.on('adb:start-battery-monitor', (_, deviceId: string, interval?: number) => {
    adbService.startBatteryMonitor(
      deviceId,
      interval || BATTERY_POLL_INTERVAL,
      (info: BatteryInfo) => {
        mainWindow?.webContents.send('battery-update', info);
      }
    );
  });

  ipcMain.on('adb:stop-battery-monitor', () => {
    adbService.stopBatteryMonitor();
  });

  // Crash logcat handlers
  ipcMain.on('adb:start-crash-logcat', (_, deviceId: string) => {
    adbService.startCrashLogcat(deviceId, (entry: CrashEntry) => {
      mainWindow?.webContents.send('crash-entry', entry);
    });
  });

  ipcMain.on('adb:stop-crash-logcat', () => {
    adbService.stopCrashLogcat();
  });

  ipcMain.handle('adb:clear-crash-logcat', async (_, deviceId: string) => {
    return adbService.clearCrashLogcat(deviceId);
  });

  // Services handlers
  ipcMain.handle('adb:get-services', async (_, deviceId: string, packageName?: string) => {
    return adbService.getRunningServices(deviceId, packageName);
  });

  // Network stats handlers
  ipcMain.handle('adb:get-network-stats', async (_, deviceId: string, packageName?: string) => {
    return adbService.getNetworkStats(deviceId, packageName);
  });

  ipcMain.on('adb:start-network-stats-monitor', (_, deviceId: string, packageName: string, interval?: number) => {
    adbService.startNetworkStatsMonitor(
      deviceId,
      packageName,
      interval || NETWORK_STATS_POLL_INTERVAL,
      (stats: AppNetworkStats) => {
        mainWindow?.webContents.send('network-stats-update', stats);
      }
    );
  });

  ipcMain.on('adb:stop-network-stats-monitor', () => {
    adbService.stopNetworkStatsMonitor();
  });

  // Activity Stack handlers
  ipcMain.handle('adb:get-activity-stack', async (_, deviceId: string, packageName: string) => {
    return adbService.getActivityStack(deviceId, packageName);
  });

  // Job Scheduler handlers
  ipcMain.handle('adb:get-scheduled-jobs', async (_, deviceId: string, packageName?: string) => {
    return adbService.getScheduledJobs(deviceId, packageName);
  });

  // Alarm Monitor handlers
  ipcMain.handle('adb:get-scheduled-alarms', async (_, deviceId: string, packageName?: string) => {
    return adbService.getScheduledAlarms(deviceId, packageName);
  });

  // App Installation handlers
  ipcMain.handle('app:select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select APK or AAB File',
      filters: [
        { name: 'Android Apps', extensions: ['apk', 'aab'] },
        { name: 'APK Files', extensions: ['apk'] },
        { name: 'AAB Files', extensions: ['aab'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
    const fileType = filePath.toLowerCase().endsWith('.aab') ? 'aab' : 'apk';

    try {
      const stats = fs.statSync(filePath);
      return {
        filePath,
        fileName,
        fileSize: stats.size,
        fileType,
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle('app:install', async (event, deviceId: string, filePath: string, options: InstallOptions) => {
    const fileType = filePath.toLowerCase().endsWith('.aab') ? 'aab' : 'apk';

    const onProgress = (progress: InstallProgress) => {
      mainWindow?.webContents.send('install-progress', progress);
    };

    if (fileType === 'aab') {
      return adbService.installAab(deviceId, filePath, options, onProgress);
    } else {
      return adbService.installApk(deviceId, filePath, options, onProgress);
    }
  });

  ipcMain.handle('app:get-device-spec', async (_, deviceId: string) => {
    return adbService.getDeviceSpec(deviceId);
  });

  ipcMain.handle('app:check-java', async () => {
    return adbService.checkJavaAvailable();
  });

  ipcMain.handle('app:check-bundletool', async () => {
    const bundletoolPath = adbService.getBundletoolPath();
    return !!bundletoolPath;
  });

  ipcMain.handle('app:get-bundletool-info', async () => {
    const bundletoolPath = adbService.getBundletoolPath();
    if (!bundletoolPath) {
      return null;
    }
    return {
      path: bundletoolPath,
      version: '1.17.2', // Bundled version
    };
  });

  // Auto-updater handlers
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        return {
          updateAvailable: true,
          version: result.updateInfo.version,
        };
      }
      return { updateAvailable: false };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return {
        updateAvailable: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('Error downloading update:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('updater:install', async () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('updater:get-version', async () => {
    return app.getVersion();
  });

  ipcMain.handle('updater:get-settings', async () => {
    return loadUpdateSettings();
  });

  ipcMain.handle('updater:set-settings', async (_, settings: UpdateSettings) => {
    saveUpdateSettings(settings);
    autoUpdater.autoDownload = settings.autoDownload;
  });
}

function setupAutoUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    const updateInfo: UpdateInfo = {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate,
    };
    mainWindow?.webContents.send('updater:available', updateInfo);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    const updateProgress: UpdateProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    };
    mainWindow?.webContents.send('updater:progress', updateProgress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const updateInfo: UpdateInfo = {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate,
    };
    mainWindow?.webContents.send('updater:downloaded', updateInfo);
  });

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('updater:error', error.message);
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  setupAutoUpdaterEvents();
  createWindow();

  // Auto-check for updates on startup (only in packaged app)
  if (app.isPackaged) {
    const updateSettings = loadUpdateSettings();
    autoUpdater.autoDownload = updateSettings.autoDownload;
    if (updateSettings.autoCheckOnStartup) {
      // Delay check slightly to allow window to load
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((error) => {
          console.error('Auto-update check failed:', error);
        });
      }, 3000);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  adbService.stopAll();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  adbService.stopAll();
});
