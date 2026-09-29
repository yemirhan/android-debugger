/**
 * IPC used by the renderer's command panel for actions that had no existing
 * handler: dialog-free captures, uninstall, key events, clipboard and Finder.
 */
import { app, clipboard, ipcMain, nativeImage, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { RecordingState } from '@android-debugger/shared';
import type { AdbService } from './adb';
import { captureFileName } from './capture-names';

interface CommandIpcDeps {
  adbService: AdbService;
  /** Receives recording state changes (keeps the tray and renderer in sync). */
  onRecordingState: (state: RecordingState) => void;
}

/** Where dialog-free screenshots and recordings are written. */
export function getCapturesDir(): string {
  return path.join(app.getPath('pictures'), 'Android Debugger');
}

function assertExistingFile(filePath: unknown): string {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  return filePath;
}

/** Saves a PNG into the captures folder without a dialog (command panel, MCP). */
export async function captureScreenshotToCaptures(
  adbService: AdbService,
  deviceId: string,
  deviceLabel?: string
): Promise<{ path: string; bytes: number }> {
  const target = path.join(getCapturesDir(), captureFileName('screenshot', new Date(), deviceLabel));
  return adbService.captureScreenshotTo(deviceId, target);
}

/** Starts a screen recording that is saved into the captures folder when stopped. */
export async function startRecordingToCaptures(
  adbService: AdbService,
  deviceId: string,
  deviceLabel: string | undefined,
  onRecordingState: (state: RecordingState) => void
): Promise<{ success: boolean; path?: string }> {
  const dir = getCapturesDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const target = path.join(dir, captureFileName('recording', new Date(), deviceLabel));
  return adbService.startScreenRecording(deviceId, target, onRecordingState);
}

export function registerCommandIpc({ adbService, onRecordingState }: CommandIpcDeps): void {
  ipcMain.handle('commands:capture-screenshot', async (_, deviceId: string, deviceLabel?: string) =>
    captureScreenshotToCaptures(adbService, deviceId, deviceLabel)
  );

  ipcMain.handle('commands:start-recording', async (_, deviceId: string, deviceLabel?: string) =>
    startRecordingToCaptures(adbService, deviceId, deviceLabel, onRecordingState)
  );

  ipcMain.handle('commands:uninstall-app', async (_, deviceId: string, packageName: string) => {
    await adbService.uninstallApp(deviceId, packageName);
  });

  ipcMain.handle('commands:send-key-events', async (_, deviceId: string, keyCodes: number[]) => {
    await adbService.sendKeyEvents(deviceId, Array.isArray(keyCodes) ? keyCodes : []);
  });

  ipcMain.handle('commands:open-captures-folder', async () => {
    const dir = getCapturesDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const error = await shell.openPath(dir);
    if (error) throw new Error(error);
  });

  ipcMain.handle('shell:show-item-in-folder', async (_, filePath: string) => {
    shell.showItemInFolder(assertExistingFile(filePath));
  });

  ipcMain.handle('clipboard:write-text', async (_, text: string) => {
    clipboard.writeText(String(text ?? ''));
  });

  ipcMain.handle('clipboard:write-image', async (_, filePath: string) => {
    const image = nativeImage.createFromPath(assertExistingFile(filePath));
    if (image.isEmpty()) throw new Error('Could not read the image');
    clipboard.writeImage(image);
  });
}
