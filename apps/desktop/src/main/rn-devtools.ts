import { ipcMain, session, shell, type WebContents } from 'electron';
import { execFile } from 'child_process';
import * as http from 'http';
import WebSocket from 'ws';
import {
  RN_DEVTOOLS_PARTITION,
  isLocalDevUrl,
  isMetroStatusBody,
  parseMetroMessage,
  parseMetroPort,
  parseMetroTargets,
  reverseListHasPort,
  serializeMetroMessage,
  type MetroAppCommand,
  type MetroProbe,
} from './rn-devtools-protocol';

/**
 * React Native DevTools support: finds Metro, lists its debug targets, sends
 * app commands over Metro's message socket, and locks down the <webview> that
 * hosts the DevTools frontend.
 */

export interface RnDevtoolsResult {
  ok: boolean;
  error?: string;
}

const PROBE_TIMEOUT_MS = 1500;
const SOCKET_TIMEOUT_MS = 3000;
const ADB_TIMEOUT_MS = 10_000;

interface HttpResponse {
  status: number;
  body: string;
}

function request(url: string, method: 'GET' | 'POST' = 'GET', timeout = PROBE_TIMEOUT_MS): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, timeout, headers: { Accept: 'application/json, text/plain, */*' } }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        // Target lists are tiny; refuse to buffer anything absurd.
        if (size > 2 * 1024 * 1024) {
          req.destroy(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** Metro binds to IPv4 or IPv6 localhost depending on the CLI; try both. */
const PROBE_HOSTS = ['127.0.0.1', '[::1]'];

async function probeOrigin(origin: string, port: number): Promise<MetroProbe | null> {
  let status: HttpResponse;
  try {
    status = await request(`${origin}/status`);
  } catch {
    return null; // Nothing listening here
  }

  let list: HttpResponse | null = null;
  try {
    list = await request(`${origin}/json/list`);
  } catch {
    list = null;
  }

  let json: unknown = null;
  if (list && list.status === 200) {
    try {
      json = JSON.parse(list.body);
    } catch {
      json = null;
    }
  }

  const isMetro = isMetroStatusBody(status.body);
  if (!isMetro && !Array.isArray(json)) return { state: 'not-metro', port, origin };

  return {
    state: 'running',
    port,
    origin,
    inspector: Array.isArray(json),
    targets: parseMetroTargets(json, origin),
  };
}

export async function probeMetro(portInput: unknown): Promise<MetroProbe> {
  const port = parseMetroPort(portInput);
  if (!port) throw new Error('Invalid Metro port');

  let fallback: MetroProbe | null = null;
  for (const host of PROBE_HOSTS) {
    const result = await probeOrigin(`http://${host}:${port}`, port);
    if (result?.state === 'running') return result;
    fallback ??= result;
  }
  return fallback ?? { state: 'not-running', port };
}

async function resolveMetroOrigin(port: number): Promise<string> {
  const probe = await probeMetro(port);
  if (probe.state !== 'running') throw new Error(`Metro isn't running on port ${port}`);
  return probe.origin;
}

/**
 * Broadcasts a command to every app connected to Metro's /message socket (the
 * same channel the CLI's "r" and "m" keys use). Checks for connected apps
 * first so the user gets a useful error instead of silence.
 */
export async function sendMetroCommand(portInput: unknown, method: MetroAppCommand): Promise<RnDevtoolsResult> {
  const port = parseMetroPort(portInput);
  if (!port) return { ok: false, error: 'Invalid Metro port' };
  if (method !== 'reload' && method !== 'devMenu') return { ok: false, error: 'Unknown command' };

  let origin: string;
  try {
    origin = await resolveMetroOrigin(port);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const socketUrl = `${origin.replace(/^http/, 'ws')}/message`;
  return new Promise<RnDevtoolsResult>((resolve) => {
    let settled = false;
    const socket = new WebSocket(socketUrl);
    const finish = (result: RnDevtoolsResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closed
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'Metro did not answer' }), SOCKET_TIMEOUT_MS);
    const requestId = `adbg-${Date.now()}`;

    socket.on('open', () => {
      socket.send(serializeMetroMessage({ id: requestId, target: 'server', method: 'getpeers' }));
    });
    socket.on('message', (data) => {
      const message = parseMetroMessage(data.toString());
      if (!message || message.id !== requestId) return;
      const peers = message.result && typeof message.result === 'object' ? Object.keys(message.result) : [];
      if (peers.length === 0) {
        finish({ ok: false, error: 'No app is connected to Metro. Open your app on the device first.' });
        return;
      }
      socket.send(serializeMetroMessage({ method }), (error) => {
        finish(error ? { ok: false, error: error.message } : { ok: true });
      });
    });
    socket.on('error', (error) => finish({ ok: false, error: `Couldn't reach Metro's message socket (${error.message})` }));
    socket.on('close', () => finish({ ok: false, error: 'Metro closed the connection' }));
  });
}

/**
 * Opens the target in Chrome/Edge through Metro's own launcher, falling back
 * to the default browser when Metro can't launch one.
 */
export async function openDevtoolsExternally(portInput: unknown, targetId: unknown): Promise<RnDevtoolsResult> {
  const port = parseMetroPort(portInput);
  if (!port) return { ok: false, error: 'Invalid Metro port' };
  if (typeof targetId !== 'string' || !targetId) return { ok: false, error: 'Pick a target first' };

  let probe: MetroProbe;
  try {
    probe = await probeMetro(port);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (probe.state !== 'running') return { ok: false, error: `Metro isn't running on port ${port}` };
  const target = probe.targets.find((candidate) => candidate.id === targetId);
  if (!target) return { ok: false, error: 'That app is no longer connected to Metro' };

  try {
    const response = await request(
      `${probe.origin}/open-debugger?target=${encodeURIComponent(target.id)}`,
      'POST',
      10_000
    );
    if (response.status >= 200 && response.status < 300) return { ok: true };
  } catch {
    // Fall through to the default browser
  }

  if (target.frontendUrl && isLocalDevUrl(target.frontendUrl)) {
    await shell.openExternal(target.frontendUrl);
    return { ok: true };
  }
  return { ok: false, error: 'Metro could not open a browser for this target' };
}

function assertDeviceId(deviceId: unknown): asserts deviceId is string {
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(deviceId)) {
    throw new Error('Invalid Android device ID');
  }
}

function runAdb(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { timeout: ADB_TIMEOUT_MS, encoding: 'utf-8' }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolve(stdout);
    });
  });
}

export async function isPortReversed(deviceId: unknown, portInput: unknown): Promise<boolean> {
  assertDeviceId(deviceId);
  const port = parseMetroPort(portInput);
  if (!port) throw new Error('Invalid Metro port');
  const stdout = await runAdb(['-s', deviceId, 'reverse', '--list']);
  return reverseListHasPort(stdout, port);
}

export async function reversePort(deviceId: unknown, portInput: unknown): Promise<RnDevtoolsResult> {
  try {
    assertDeviceId(deviceId);
    const port = parseMetroPort(portInput);
    if (!port) throw new Error('Invalid Metro port');
    await runAdb(['-s', deviceId, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Opens the RN dev menu on the device (KEYCODE_MENU), for when Metro's socket isn't an option. */
export async function openDevMenuViaAdb(deviceId: unknown): Promise<RnDevtoolsResult> {
  try {
    assertDeviceId(deviceId);
    await runAdb(['-s', deviceId, 'shell', 'input', 'keyevent', '82']);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function registerRnDevtoolsIpc(): void {
  ipcMain.handle('rn-devtools:probe', (_, port: unknown) => probeMetro(port));
  ipcMain.handle('rn-devtools:command', (_, port: unknown, method: MetroAppCommand) => sendMetroCommand(port, method));
  ipcMain.handle('rn-devtools:open-external', (_, port: unknown, targetId: unknown) => openDevtoolsExternally(port, targetId));
  ipcMain.handle('rn-devtools:is-reversed', (_, deviceId: unknown, port: unknown) => isPortReversed(deviceId, port));
  ipcMain.handle('rn-devtools:reverse', (_, deviceId: unknown, port: unknown) => reversePort(deviceId, port));
  ipcMain.handle('rn-devtools:dev-menu-adb', (_, deviceId: unknown) => openDevMenuViaAdb(deviceId));
}

function openLinkExternally(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalDevUrl(url))) {
      void shell.openExternal(parsed.toString());
    }
  } catch {
    // Ignore malformed URLs
  }
}

let partitionConfigured = false;

function configureDevtoolsSession(): void {
  if (partitionConfigured) return;
  partitionConfigured = true;
  const devtoolsSession = session.fromPartition(RN_DEVTOOLS_PARTITION);
  // DevTools needs nothing beyond writing to the clipboard ("Copy value" etc.).
  const allowed = new Set(['clipboard-sanitized-write']);
  devtoolsSession.setPermissionRequestHandler((_, permission, callback) => callback(allowed.has(permission)));
  devtoolsSession.setPermissionCheckHandler((_, permission) => allowed.has(permission));
}

/**
 * Hardens <webview> tags in the main window: they may only host the DevTools
 * frontend from a local dev server, in their own session, without preload
 * scripts or Node, and can't navigate or open windows elsewhere.
 */
export function guardDevtoolsWebviews(host: WebContents): void {
  configureDevtoolsSession();

  host.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isLocalDevUrl(params.src)) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.webviewTag = false;
    // Electron builds the guest from webPreferences (already derived from the
    // tag's attributes), so the session and popup lockdown must be set here,
    // not on params, or a tag without partition="..." gets the default session.
    webPreferences.partition = RN_DEVTOOLS_PARTITION;
    (webPreferences as Record<string, unknown>).disablePopups = true;
  });

  host.on('did-attach-webview', (_, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      openLinkExternally(url);
      return { action: 'deny' };
    });

    const blockForeignNavigation = (event: Electron.Event, url: string) => {
      if (isLocalDevUrl(url)) return;
      event.preventDefault();
      openLinkExternally(url);
    };
    guest.on('will-navigate', blockForeignNavigation);
    guest.on('will-redirect', blockForeignNavigation);

    // Keyboard focus inside the guest never reaches the app's own shortcuts;
    // forward ⌘K / Ctrl+K so the tool switcher works everywhere.
    guest.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.meta || input.control) &&
        !input.shift &&
        !input.alt &&
        input.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        if (!host.isDestroyed()) host.send('rn-devtools:shortcut', 'command-palette');
      }
    });
  });
}
