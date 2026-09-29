import { ipcMain, clipboard, MessageChannelMain, type MessagePortMain, type WebContents } from 'electron';
import { randomUUID } from 'crypto';
import { scrcpyService } from './scrcpy-service';
import { ScrcpyMirrorSession, ServerVersionMismatchError, type MirrorSessionOptions } from './scrcpy-stream';
import type {
  MirrorPortMessage,
  MirrorServerStatus,
  MirrorStartOptions,
  MirrorStartResult,
} from '../renderer/lib/mirror/types';

/**
 * In-app mirroring sessions. At most one session runs at a time; it belongs
 * to the web contents that started it and is stopped when that page reloads,
 * crashes or closes, when a new session starts, or on app quit.
 */

interface ActiveMirror {
  id: string;
  deviceId: string;
  session: ScrcpyMirrorSession;
  port: MessagePortMain;
  detach: () => void;
}

let active: ActiveMirror | null = null;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitizeOptions(options: Partial<MirrorStartOptions> | undefined): MirrorSessionOptions {
  const o = options ?? {};
  return {
    maxSize: clamp(o.maxSize, 0, 4096, 1280),
    videoBitRate: clamp(o.videoBitRate, 500_000, 50_000_000, 8_000_000),
    maxFps: clamp(o.maxFps, 1, 120, 60),
    stayAwake: o.stayAwake !== false,
    showTouches: o.showTouches === true,
    turnScreenOff: o.turnScreenOff === true,
  };
}

function post(port: MessagePortMain, message: MirrorPortMessage): void {
  try {
    port.postMessage(message);
  } catch {
    // Port closed (renderer gone); the session is being torn down.
  }
}

export async function stopMirrorSession(sessionId?: string): Promise<void> {
  const current = active;
  if (!current) return;
  if (sessionId && current.id !== sessionId) return;
  active = null;
  current.detach();
  await current.session.stop();
}

export function stopAllMirrorSessions(): Promise<void> {
  return stopMirrorSession();
}

async function startMirrorSession(
  webContents: WebContents,
  deviceId: string,
  rawOptions: Partial<MirrorStartOptions> | undefined
): Promise<MirrorStartResult> {
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(deviceId)) {
    return { success: false, error: 'Invalid Android device ID', code: 'failed' };
  }
  const options = sanitizeOptions(rawOptions);

  await stopMirrorSession();

  const server = await scrcpyService.getServerInfo();
  if (!server) {
    return {
      success: false,
      code: 'server-missing',
      error: 'The scrcpy server was not found. Install scrcpy (brew install scrcpy) or download it below.',
    };
  }

  const id = randomUUID();
  const { port1, port2 } = new MessageChannelMain();
  let closed = false;

  const createSession = (version: string) =>
    new ScrcpyMirrorSession(deviceId, { path: server.path, version }, options, {
      onVideoEvent: (event) => {
        switch (event.type) {
          case 'device-meta':
            post(port1, { type: 'device-meta', deviceName: event.deviceName });
            break;
          case 'codec':
            post(port1, { type: 'codec', codec: event.codec });
            break;
          case 'session':
            post(port1, { type: 'session', width: event.width, height: event.height });
            break;
          case 'packet':
            post(port1, {
              type: 'packet',
              config: event.config,
              keyFrame: event.keyFrame,
              pts: event.pts,
              data: event.data,
            });
            break;
          default:
            break;
        }
      },
      onDeviceMessage: (message) => {
        if (message.type === 'clipboard') {
          clipboard.writeText(message.text);
          post(port1, { type: 'clipboard', length: message.text.length });
        }
      },
      onClosed: (error) => {
        if (closed) return;
        closed = true;
        post(port1, { type: 'closed', error });
        port1.close();
        if (active?.id === id) {
          active.detach();
          active = null;
        }
      },
    });

  let session = createSession(server.version ?? '0');

  // Tear the session down if its page goes away.
  const onNavigate = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
    if (details.isMainFrame && !details.isSameDocument) void stopMirrorSession(id);
  };
  const onGone = () => void stopMirrorSession(id);
  webContents.on('did-start-navigation', onNavigate);
  webContents.on('render-process-gone', onGone);
  webContents.on('destroyed', onGone);
  const detach = () => {
    if (webContents.isDestroyed()) return;
    webContents.removeListener('did-start-navigation', onNavigate);
    webContents.removeListener('render-process-gone', onGone);
    webContents.removeListener('destroyed', onGone);
  };

  port1.on('message', (event) => {
    const data = event.data as { type?: unknown; request?: unknown } | null;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'control') {
      session.sendControl(data.request);
    } else if (data.type === 'paste') {
      session.pasteText(clipboard.readText());
    }
  });
  port1.start();

  active = { id, deviceId, session, port: port1, detach };
  // Messages posted before the renderer picks the port up are queued.
  webContents.postMessage('mirror:port', { sessionId: id }, [port2]);

  try {
    try {
      await session.start();
    } catch (error) {
      // The installed server reports its own version; retry once with it.
      if (!(error instanceof ServerVersionMismatchError) || active?.id !== id) throw error;
      session = createSession(error.serverVersion);
      active = { id, deviceId, session, port: port1, detach };
      await session.start();
    }
    if (active?.id !== id) throw new Error('Mirroring was stopped');
    return { success: true, sessionId: id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start mirroring';
    if (active?.id === id) {
      active = null;
      detach();
    }
    if (!closed) {
      closed = true;
      post(port1, { type: 'closed', error: message });
      port1.close();
    }
    await session.stop().catch(() => {});
    return { success: false, sessionId: id, error: message, code: 'failed' };
  }
}

async function getServerStatus(): Promise<MirrorServerStatus> {
  const info = await scrcpyService.getServerInfo();
  return { available: !!info, version: info?.version ?? null, path: info?.path ?? null };
}

export function registerMirrorIpcHandlers(): void {
  ipcMain.handle('mirror:get-server-status', () => getServerStatus());
  ipcMain.handle('mirror:start', (event, deviceId: string, options: Partial<MirrorStartOptions>) =>
    startMirrorSession(event.sender, deviceId, options)
  );
  ipcMain.handle('mirror:stop', async (_, sessionId?: string) => {
    await stopMirrorSession(typeof sessionId === 'string' ? sessionId : undefined);
    return { success: true };
  });
}
