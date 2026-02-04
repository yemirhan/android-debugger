import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { deflateSync } from 'zlib';
import type { UpdateSettings, UpdateInfo, UpdateProgress } from '@android-debugger/shared';

interface AdbInfo {
  path: string;
  version: string;
  source: 'bundled' | 'system' | 'android-sdk';
}

interface JavaInfo {
  path: string;
  version: string;
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

function getJavaInfo(): JavaInfo | null {
  try {
    // Try to get java path using 'which' on Unix or 'where' on Windows
    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where java' : 'which java';

    let javaPath: string;
    try {
      javaPath = execSync(whichCommand, { encoding: 'utf-8' }).trim().split('\n')[0];
    } catch {
      return null;
    }

    // Get version
    const versionOutput = execSync('java -version 2>&1', { encoding: 'utf-8' });
    // Java version output is on stderr and looks like: java version "17.0.1" or openjdk version "11.0.12"
    const versionMatch = versionOutput.match(/(?:java|openjdk) version "([^"]+)"/i);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    return { path: javaPath, version };
  } catch {
    return null;
  }
}

import { adbService } from './adb';
import { scrcpyService } from './scrcpy-service';
import type {
  Device,
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
  ThreadSnapshot,
  GcEvent,
  ScrcpyConfig,
  ScrcpyState,
} from '@android-debugger/shared';
import {
  DEVICE_POLL_INTERVAL,
  MEMORY_POLL_INTERVAL,
  CPU_POLL_INTERVAL,
  FPS_POLL_INTERVAL,
  BATTERY_POLL_INTERVAL,
  NETWORK_STATS_POLL_INTERVAL,
} from '@android-debugger/shared';

// Set bundletool directory for on-demand download (not bundled due to notarization issues)
adbService.setBundletoolDir(app.getPath('userData'));

// Set scrcpy directory for on-demand download (not bundled due to notarization issues)
scrcpyService.setScrcpyDir(app.getPath('userData'));

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
let tray: Tray | null = null;
let trayDevices: Device[] = [];
let selectedDeviceId: string | null = null;
let trayUpdateInterval: NodeJS.Timeout | null = null;
let isRecording = false;
let recordingDeviceId: string | null = null;

const trayIconPixels = [
  '....##....##....',
  '...####..####...',
  '....##....##....',
  '.....######.....',
  '....########....',
  '...##########...',
  '..############..',
  '..###..##..###..',
  '..###..##..###..',
  '...##..##..##...',
  '....##.##.##....',
  '.....######.....',
  '......####......',
  '.......##.......',
  '................',
  '................',
];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function createBugPng(pixelRows: string[]): Buffer {
  const height = pixelRows.length;
  const width = pixelRows[0]?.length ?? 0;
  const rowBytes = width * 4 + 1;
  const raw = Buffer.alloc(rowBytes * height);

  pixelRows.forEach((row, y) => {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      if (row[x] === '#') {
        raw[offset] = 0;
        raw[offset + 1] = 0;
        raw[offset + 2] = 0;
        raw[offset + 3] = 255;
      } else {
        raw[offset] = 0;
        raw[offset + 1] = 0;
        raw[offset + 2] = 0;
        raw[offset + 3] = 0;
      }
    }
  });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function showMainWindow(): BrowserWindow | null {
  if (!mainWindow) {
    createWindow();
    return mainWindow;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

function getWifiLabel(device: Device | null): string {
  const wifiName = device?.wifiName?.trim();
  return wifiName && wifiName.length > 0 ? wifiName : 'Not connected';
}

function getTrayDevice(): Device | null {
  if (selectedDeviceId) {
    const selected = trayDevices.find((device) => device.id === selectedDeviceId);
    if (selected) {
      return selected;
    }
  }

  const connected = trayDevices.find((device) => device.status === 'device');
  return connected || trayDevices[0] || null;
}

function navigateToTab(tabId: string): void {
  const window = showMainWindow();
  if (!window) {
    return;
  }

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('app:navigate', tabId);
    });
  } else {
    window.webContents.send('app:navigate', tabId);
  }
}

function updateTrayMenu(): void {
  if (!tray) {
    return;
  }

  tray.setContextMenu(buildTrayMenu());
}

async function refreshTrayDevices(force = false): Promise<void> {
  if (process.platform !== 'darwin') {
    return;
  }

  if (!force && BrowserWindow.getAllWindows().length > 0) {
    return;
  }

  try {
    const devices = await adbService.getDevices();
    trayDevices = devices;
    updateTrayMenu();
  } catch (error) {
    console.error('Error refreshing tray devices:', error);
  }
}

function handleRecordingState(isActive: boolean, deviceId: string | null, outputPath?: string): void {
  isRecording = isActive;
  recordingDeviceId = isActive ? deviceId : null;
  updateTrayMenu();

  mainWindow?.webContents.send('recording-update', { isRecording: isActive, outputPath });
}

async function handleTakeScreenshot(deviceId: string) {
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: 'Save Screenshot',
    defaultPath: `screenshot_${Date.now()}.png`,
    filters: [{ name: 'PNG Images', extensions: ['png'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return adbService.takeScreenshot(deviceId, result.filePath);
}

async function handleStartRecording(deviceId: string): Promise<{ success: boolean; path?: string }> {
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: 'Save Recording',
    defaultPath: `recording_${Date.now()}.mp4`,
    filters: [{ name: 'MP4 Videos', extensions: ['mp4'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false };
  }

  const response = await adbService.startScreenRecording(deviceId, result.filePath, (active) => {
    handleRecordingState(active, active ? deviceId : null, result.filePath);
  });

  if (!response.success) {
    updateTrayMenu();
  }

  return response;
}

async function handleStopRecording(deviceId: string): Promise<{ success: boolean; path?: string }> {
  const result = await adbService.stopScreenRecording(deviceId);
  handleRecordingState(false, null, result.path);
  return result;
}

function buildTrayMenu(): Menu {
  const device = getTrayDevice();
  const isDeviceReady = !!device && device.status === 'device';
  const wifiLabel = getWifiLabel(device);

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'Android Debugger', enabled: false },
    { type: 'separator' },
  ];

  if (device) {
    template.push(
      { label: `Device: ${device.model}`, enabled: false },
      { label: `Android: ${device.androidVersion}`, enabled: false },
      { label: `Wi-Fi: ${wifiLabel}`, enabled: false },
      { label: `Status: ${device.status}`, enabled: false },
      { label: `ID: ${device.id}`, enabled: false }
    );
  } else {
    template.push({ label: 'No device connected', enabled: false });
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Quick Actions',
      submenu: [
        { label: 'Open Dashboard', click: () => navigateToTab('dashboard') },
        { label: 'Open Network Stats', click: () => navigateToTab('network-stats') },
        { label: 'Open CPU/FPS', click: () => navigateToTab('cpu-fps') },
        { label: 'Open Memory', click: () => navigateToTab('memory') },
        { type: 'separator' },
        {
          label: 'Take Screenshot...',
          enabled: isDeviceReady,
          click: async () => {
            if (device) {
              await handleTakeScreenshot(device.id);
            }
          },
        },
        {
          label: 'Start Screen Recording...',
          enabled: isDeviceReady && !isRecording,
          click: async () => {
            if (device) {
              await handleStartRecording(device.id);
            }
          },
        },
        {
          label: 'Stop Screen Recording',
          enabled: isDeviceReady && isRecording && (!recordingDeviceId || recordingDeviceId === device?.id),
          click: async () => {
            if (device) {
              await handleStopRecording(device.id);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Refresh Devices',
          click: async () => {
            await refreshTrayDevices(true);
          },
        },
      ],
    },
    { type: 'separator' },
    { label: 'Show Android Debugger', click: () => showMainWindow() },
    { label: 'Quit', click: () => app.quit() }
  );

  return Menu.buildFromTemplate(template);
}

function createTray(): void {
  if (process.platform !== 'darwin' || tray) {
    return;
  }

  const image = nativeImage.createFromBuffer(createBugPng(trayIconPixels));
  image.setTemplateImage(true);

  tray = new Tray(image);
  tray.setToolTip('Android Debugger');
  tray.on('click', () => {
    tray?.popUpContextMenu();
  });

  updateTrayMenu();
  refreshTrayDevices(true);

  trayUpdateInterval = setInterval(() => {
    refreshTrayDevices();
  }, DEVICE_POLL_INTERVAL);
}

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
    const devices = await adbService.getDevices();
    trayDevices = devices;
    updateTrayMenu();
    return devices;
  });

  ipcMain.handle('adb:get-device-info', async (_, deviceId: string) => {
    return adbService.getDeviceInfo(deviceId);
  });

  ipcMain.on('app:set-selected-device', (_, deviceId: string | null) => {
    selectedDeviceId = deviceId;
    updateTrayMenu();
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
    return handleTakeScreenshot(deviceId);
  });

  ipcMain.handle('screen:start-recording', async (_, deviceId: string) => {
    return handleStartRecording(deviceId);
  });

  ipcMain.handle('screen:stop-recording', async (_, deviceId: string) => {
    return handleStopRecording(deviceId);
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

  ipcMain.handle('app:get-java-info', async () => {
    return getJavaInfo();
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
      version: '1.17.2', // Downloaded version
    };
  });

  ipcMain.handle('app:download-bundletool', async (_event) => {
    return adbService.downloadBundletool((percent, message) => {
      mainWindow?.webContents.send('bundletool-download-progress', { percent, message });
    });
  });

  ipcMain.handle('app:needs-bundletool-download', async () => {
    return adbService.needsBundletoolDownload();
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

  // ==================== Profiler Handlers ====================

  // Thread Monitor
  ipcMain.handle('profiler:get-threads', async (_, deviceId: string, packageName: string) => {
    return adbService.getThreads(deviceId, packageName);
  });

  ipcMain.on('profiler:start-thread-monitor', (_, deviceId: string, packageName: string, interval: number) => {
    adbService.startThreadMonitor(
      deviceId,
      packageName,
      interval,
      (snapshot: ThreadSnapshot) => {
        mainWindow?.webContents.send('thread-update', snapshot);
      }
    );
  });

  ipcMain.on('profiler:stop-thread-monitor', () => {
    adbService.stopThreadMonitor();
  });

  // GC Monitor
  ipcMain.on('profiler:start-gc-monitor', (_, deviceId: string, packageName: string) => {
    adbService.startGcMonitor(
      deviceId,
      packageName,
      (event: GcEvent) => {
        mainWindow?.webContents.send('gc-event', event);
      }
    );
  });

  ipcMain.on('profiler:stop-gc-monitor', () => {
    adbService.stopGcMonitor();
  });

  // Heap Dump
  ipcMain.handle('profiler:capture-heap-dump', async (_, deviceId: string, packageName: string) => {
    return adbService.captureHeapDump(deviceId, packageName, (status, progress) => {
      mainWindow?.webContents.send('heap-dump-progress', { id: '', status, progress });
    });
  });

  ipcMain.handle('profiler:analyze-heap-dump', async (_, filePath: string) => {
    return adbService.analyzeHeapDump(filePath);
  });

  ipcMain.handle('profiler:get-heap-instances', async (_, filePath: string, classId: number) => {
    return adbService.getHeapInstances(filePath, classId);
  });

  // Method Trace
  ipcMain.handle('profiler:start-method-trace', async (_, deviceId: string, packageName: string) => {
    return adbService.startMethodTrace(deviceId, packageName);
  });

  ipcMain.handle('profiler:stop-method-trace', async (_, deviceId: string, packageName: string) => {
    return adbService.stopMethodTrace(deviceId, packageName);
  });

  ipcMain.handle('profiler:analyze-method-trace', async (_, filePath: string) => {
    return adbService.analyzeMethodTrace(filePath);
  });

  // ==================== Scrcpy (Screen Mirror) Handlers ====================

  // Set up scrcpy state change listener
  scrcpyService.onState((state: ScrcpyState) => {
    if (state.isRunning) {
      mainWindow?.webContents.send('scrcpy-mirror-started', state);
    } else if (state.error) {
      mainWindow?.webContents.send('scrcpy-mirror-error', state.error);
    } else {
      mainWindow?.webContents.send('scrcpy-mirror-stopped');
    }
  });

  ipcMain.handle('scrcpy:check', async () => {
    return scrcpyService.isScrcpyAvailable();
  });

  ipcMain.handle('scrcpy:get-info', async () => {
    return scrcpyService.getScrcpyInfo();
  });

  ipcMain.handle('scrcpy:needs-download', async () => {
    return scrcpyService.needsScrcpyDownload();
  });

  ipcMain.handle('scrcpy:download', async () => {
    return scrcpyService.downloadScrcpy((percent, message) => {
      mainWindow?.webContents.send('scrcpy-download-progress', { percent, message });
    });
  });

  ipcMain.handle('scrcpy:start', async (_, deviceId: string, config: ScrcpyConfig) => {
    return scrcpyService.startMirror(deviceId, config);
  });

  ipcMain.handle('scrcpy:stop', async () => {
    scrcpyService.stopMirror();
    return { success: true };
  });

  ipcMain.handle('scrcpy:get-state', async () => {
    return scrcpyService.getState();
  });

  ipcMain.handle('scrcpy:is-mirroring', async (_, deviceId?: string) => {
    return scrcpyService.isMirroring(deviceId);
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
  createTray();

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

  if (trayUpdateInterval) {
    clearInterval(trayUpdateInterval);
    trayUpdateInterval = null;
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }
});
