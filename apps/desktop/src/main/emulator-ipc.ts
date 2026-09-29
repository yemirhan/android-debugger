/**
 * IPC for the Emulators tool. Every argument coming from the renderer is
 * type-checked here; EmulatorService validates names, ids and state again.
 */
import { ipcMain, shell } from 'electron';
import type { CreateAvdRequest, StartAvdOptions } from './emulator-types';
import type { EmulatorService } from './emulator-service';

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Missing ${what}`);
  return value;
}

function asStartOptions(value: unknown): StartAvdOptions {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    coldBoot: source.coldBoot === true,
    wipeData: source.wipeData === true,
    headless: source.headless === true,
    noAudio: source.noAudio === true,
  };
}

function asCreateRequest(value: unknown): CreateAvdRequest {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const number = (key: string) => (typeof source[key] === 'number' ? (source[key] as number) : undefined);
  return {
    name: asString(source.name, 'name'),
    systemImage: asString(source.systemImage, 'system image'),
    device: asString(source.device, 'device profile'),
    displayName: typeof source.displayName === 'string' ? source.displayName : undefined,
    ramMb: number('ramMb'),
    storageGb: number('storageGb'),
    sdCardMb: number('sdCardMb'),
  };
}

export function registerEmulatorIpc(service: EmulatorService, send: (channel: string, payload?: unknown) => void): void {
  service.on('boot', (progress) => send('emulators:boot', progress));
  service.on('install', (job) => send('emulators:install', job));
  service.on('changed', () => send('emulators:changed'));

  ipcMain.handle('emulators:setup', (_, force: unknown) => service.getSetup(force === true));
  ipcMain.handle('emulators:list', () => service.listAvds());
  ipcMain.handle('emulators:start', (_, name: unknown, options: unknown) =>
    service.startAvd(asString(name, 'emulator name'), asStartOptions(options))
  );
  ipcMain.handle('emulators:stop', (_, name: unknown) => service.stopAvd(asString(name, 'emulator name')));
  ipcMain.handle('emulators:delete', (_, name: unknown) => service.deleteAvd(asString(name, 'emulator name')));
  ipcMain.handle('emulators:wipe', (_, name: unknown) => service.wipeAvd(asString(name, 'emulator name')));
  ipcMain.handle('emulators:rename', (_, name: unknown, newName: unknown) =>
    service.renameAvd(asString(name, 'emulator name'), asString(newName, 'new name'))
  );
  ipcMain.handle('emulators:delete-snapshot', (_, name: unknown, snapshot: unknown) =>
    service.deleteSnapshot(asString(name, 'emulator name'), asString(snapshot, 'snapshot'))
  );
  ipcMain.handle('emulators:show-in-folder', async (_, name: unknown) => {
    shell.showItemInFolder(await service.avdPath(asString(name, 'emulator name')));
  });
  ipcMain.handle('emulators:device-profiles', (_, force: unknown) => service.listDeviceProfiles(force === true));
  ipcMain.handle('emulators:system-images', () => service.listSystemImages());
  ipcMain.handle('emulators:available-images', (_, force: unknown) => service.listAvailableImages(force === true));
  ipcMain.handle('emulators:create', (_, request: unknown) => service.createAvd(asCreateRequest(request)));
  ipcMain.handle('emulators:install-image', (_, packageId: unknown) => service.installImage(asString(packageId, 'package')));
  ipcMain.handle('emulators:install-jobs', () => service.getInstallJobs());
  ipcMain.handle('emulators:respond-license', (_, jobId: unknown, accept: unknown) =>
    service.respondToLicense(asString(jobId, 'job'), accept === true)
  );
  ipcMain.handle('emulators:cancel-install', (_, jobId: unknown) => service.cancelInstall(asString(jobId, 'job')));
}
