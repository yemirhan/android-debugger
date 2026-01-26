import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { adbService } from './adb';
import { wsService } from './websocket';
import type { LogEntry, MemoryInfo, CpuInfo, FpsInfo, SdkMessage } from '@android-debugger/shared';
import { MEMORY_POLL_INTERVAL, CPU_POLL_INTERVAL, FPS_POLL_INTERVAL } from '@android-debugger/shared';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
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
  ipcMain.on('adb:start-logcat', (_, deviceId: string, filters?: string[]) => {
    adbService.startLogcat(
      deviceId,
      (entry: LogEntry) => {
        mainWindow?.webContents.send('log-entry', entry);
      },
      filters
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

  // WebSocket handlers
  ipcMain.handle('ws:start-server', async (_, port: number) => {
    await wsService.start(port);

    wsService.onMessage((clientId: string, message: SdkMessage) => {
      mainWindow?.webContents.send('sdk-message', { clientId, message });
    });

    wsService.onConnection((clientId: string, connected: boolean) => {
      mainWindow?.webContents.send('sdk-connection', { clientId, connected });
    });
  });

  ipcMain.handle('ws:stop-server', async () => {
    await wsService.stop();
  });

  ipcMain.handle('ws:get-connections', () => {
    return wsService.getConnectionCount();
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  adbService.stopAll();
  wsService.stop();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  adbService.stopAll();
  wsService.stop();
});
