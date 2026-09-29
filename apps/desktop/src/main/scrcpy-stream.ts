import { spawn, execFile, type ChildProcess } from 'child_process';
import { randomInt } from 'crypto';
import * as net from 'net';
import { promisify } from 'util';
import {
  VideoStreamParser,
  DeviceMessageParser,
  buildServerShellArgs,
  encodeControlRequest,
  extractServerError,
  formatScid,
  parseServerVersionMismatch,
  serializeSetClipboard,
  serializeSetDisplayPower,
  socketNameForScid,
  type VideoStreamEvent,
  type DeviceMessage,
} from './scrcpy-protocol';

const execFileAsync = promisify(execFile);

/**
 * One in-app mirroring session: pushes the scrcpy server, starts it through
 * `adb shell`, connects the video and control sockets through an adb forward,
 * demuxes the video stream and forwards control messages.
 *
 * The adb forward is removed as soon as both sockets are connected (like the
 * scrcpy client does), so a crash of this process cannot leak it. Closing the
 * sockets makes the server exit; `cleanup=true` restores the device state
 * (display power, stay awake, show touches) and deletes the pushed jar.
 */

export interface MirrorQuality {
  /** Longest side of the video in pixels (0 = native). */
  maxSize: number;
  /** Video bit rate in bits per second. */
  videoBitRate: number;
  maxFps: number;
}

export interface MirrorSessionOptions extends MirrorQuality {
  stayAwake: boolean;
  showTouches: boolean;
  turnScreenOff: boolean;
}

export interface MirrorServerInfo {
  path: string;
  version: string;
}

export interface MirrorSessionCallbacks {
  onVideoEvent: (event: VideoStreamEvent) => void;
  onDeviceMessage?: (message: DeviceMessage) => void;
  /** Called once when the session ends; `error` is null for a requested stop. */
  onClosed: (error: string | null) => void;
}

const CONNECT_ATTEMPTS = 100;
const CONNECT_RETRY_DELAY_MS = 100;
const ADB_TIMEOUT_MS = 30_000;
const SERVER_LOG_LIMIT = 16 * 1024;

export class ServerVersionMismatchError extends Error {
  readonly serverVersion: string;
  constructor(serverVersion: string) {
    super(`scrcpy server version ${serverVersion} does not match`);
    this.serverVersion = serverVersion;
  }
}

function adb(deviceId: string, args: string[], timeout = ADB_TIMEOUT_MS) {
  return execFileAsync('adb', ['-s', deviceId, ...args], { encoding: 'utf8', timeout });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ScrcpyMirrorSession {
  readonly deviceId: string;
  readonly scid: number;
  private readonly server: MirrorServerInfo;
  private readonly options: MirrorSessionOptions;
  private readonly callbacks: MirrorSessionCallbacks;

  private serverProcess: ChildProcess | null = null;
  private serverExited = false;
  private serverLog = '';
  private videoSocket: net.Socket | null = null;
  private controlSocket: net.Socket | null = null;
  private forwardPort: number | null = null;
  private closed = false;
  private stopping = false;
  private startPromise: Promise<void> | null = null;
  private clipboardSequence = 1n;

  constructor(deviceId: string, server: MirrorServerInfo, options: MirrorSessionOptions, callbacks: MirrorSessionCallbacks) {
    if (!/^[A-Za-z0-9._:-]+$/.test(deviceId)) throw new Error('Invalid Android device ID');
    this.deviceId = deviceId;
    this.server = server;
    this.options = options;
    this.callbacks = callbacks;
    this.scid = randomInt(0, 0x7fffffff);
  }

  get remotePath(): string {
    return `/data/local/tmp/adbg-scrcpy-${formatScid(this.scid)}.jar`;
  }

  start(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.doStart();
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    try {
      await adb(this.deviceId, ['push', this.server.path, this.remotePath], 60_000);
      this.assertActive();

      const { stdout } = await adb(this.deviceId, ['forward', 'tcp:0', `localabstract:${socketNameForScid(this.scid)}`]);
      const port = Number.parseInt(stdout.trim(), 10);
      if (!Number.isInteger(port) || port <= 0) throw new Error('adb did not allocate a local port for the mirror');
      this.forwardPort = port;
      this.assertActive();

      this.spawnServer();

      const videoSocket = await this.connectFirstSocket(port);
      this.videoSocket = videoSocket;
      this.assertActive();
      const controlSocket = await this.connectSocket(port);
      controlSocket.setNoDelay(true);
      this.controlSocket = controlSocket;
      this.assertActive();

      // Established connections survive the forward removal.
      await this.removeForward();
      this.wireSockets(videoSocket, controlSocket);
    } catch (error) {
      const mismatch = parseServerVersionMismatch(this.serverLog);
      await this.teardown();
      if (mismatch) throw new ServerVersionMismatchError(mismatch);
      const serverError = extractServerError(this.serverLog);
      if (serverError && !this.stopping) throw new Error(serverError);
      throw error;
    }
  }

  private assertActive(): void {
    if (this.stopping || this.closed) throw new Error('Mirroring was stopped');
    if (this.serverExited) {
      throw new Error(extractServerError(this.serverLog) ?? 'The scrcpy server exited unexpectedly');
    }
  }

  private spawnServer(): void {
    const shellArgs = buildServerShellArgs({
      version: this.server.version,
      remotePath: this.remotePath,
      scid: this.scid,
      maxSize: this.options.maxSize,
      videoBitRate: this.options.videoBitRate,
      maxFps: this.options.maxFps,
      stayAwake: this.options.stayAwake,
      showTouches: this.options.showTouches,
    });
    const child = spawn('adb', ['-s', this.deviceId, 'shell', ...shellArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.serverProcess = child;
    const append = (data: Buffer) => {
      this.serverLog = (this.serverLog + data.toString('utf8')).slice(-SERVER_LOG_LIMIT);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (error) => {
      append(Buffer.from(`\nERROR: ${error.message}\n`));
      this.serverExited = true;
    });
    child.on('exit', () => {
      this.serverExited = true;
      if (this.serverProcess === child) this.serverProcess = null;
      // Once streaming, the sockets closing is what ends the session; this
      // only matters if the server dies while we are still connecting.
    });
  }

  /** Connect and wait for the dummy byte, retrying while the server boots. */
  private async connectFirstSocket(port: number): Promise<net.Socket> {
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
      this.assertActive();
      const socket = await this.tryConnectWithDummyByte(port);
      if (socket) return socket;
      await delay(CONNECT_RETRY_DELAY_MS);
    }
    throw new Error('Timed out connecting to the scrcpy server on the device');
  }

  private tryConnectWithDummyByte(port: number): Promise<net.Socket | null> {
    return new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      let settled = false;
      const finish = (result: net.Socket | null) => {
        if (settled) return;
        settled = true;
        socket.removeListener('readable', onReadable);
        socket.removeListener('error', onFail);
        socket.removeListener('end', onFail);
        socket.removeListener('close', onFail);
        clearTimeout(timer);
        if (!result) socket.destroy();
        resolve(result);
      };
      const onReadable = () => {
        // Leave the bytes in the stream (the parser consumes the dummy byte)
        // but prove the device side is really there.
        const chunk = socket.read(1) as Buffer | null;
        if (chunk && chunk.length === 1) {
          socket.unshift(chunk);
          finish(socket);
        }
      };
      const onFail = () => finish(null);
      const timer = setTimeout(onFail, 2000);
      socket.on('readable', onReadable);
      socket.once('error', onFail);
      socket.once('end', onFail);
      socket.once('close', onFail);
    });
  }

  private connectSocket(port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      const onError = (error: Error) => reject(error);
      socket.once('error', onError);
      socket.once('connect', () => {
        socket.removeListener('error', onError);
        resolve(socket);
      });
    });
  }

  private wireSockets(videoSocket: net.Socket, controlSocket: net.Socket): void {
    const parser = new VideoStreamParser({ expectDummyByte: true, expectDeviceMeta: true });
    let displayOffSent = false;
    const onVideoData = (chunk: Buffer) => {
      let events: VideoStreamEvent[];
      try {
        events = parser.push(chunk);
      } catch (error) {
        this.close(error instanceof Error ? error.message : 'Corrupt video stream');
        return;
      }
      for (const event of events) {
        if (event.type === 'disabled') {
          this.close(
            event.error
              ? extractServerError(this.serverLog) ?? 'The device could not start video capture'
              : 'The device disabled the video stream'
          );
          return;
        }
        if (event.type === 'packet' && !displayOffSent && this.options.turnScreenOff) {
          displayOffSent = true;
          this.sendRaw(serializeSetDisplayPower(false));
        }
        this.callbacks.onVideoEvent(event);
      }
    };
    // Switch to flowing mode; the dummy byte we unshifted is delivered first.
    videoSocket.on('data', onVideoData);
    videoSocket.resume();

    const deviceParser = new DeviceMessageParser();
    controlSocket.on('data', (chunk: Buffer) => {
      try {
        for (const message of deviceParser.push(chunk)) this.callbacks.onDeviceMessage?.(message);
      } catch {
        // An unknown device message only breaks clipboard sync; keep mirroring.
        controlSocket.removeAllListeners('data');
        controlSocket.resume();
      }
    });

    const onSocketGone = () => {
      if (this.closed) return;
      const serverError = extractServerError(this.serverLog);
      this.close(serverError ?? 'The mirror connection closed. The device may have been disconnected.');
    };
    for (const socket of [videoSocket, controlSocket]) {
      socket.on('error', () => {});
      socket.on('close', onSocketGone);
    }
  }

  private sendRaw(bytes: Uint8Array): void {
    const socket = this.controlSocket;
    if (!socket || socket.destroyed || this.closed) return;
    socket.write(bytes);
  }

  /** Serialize and send a renderer control request. Returns false if invalid. */
  sendControl(request: unknown): boolean {
    const bytes = encodeControlRequest(request);
    if (!bytes) return false;
    this.sendRaw(bytes);
    return true;
  }

  /** Put host text on the device clipboard and paste it into the focused field. */
  pasteText(text: string): void {
    if (!text) return;
    this.sendRaw(serializeSetClipboard(this.clipboardSequence++, text, true));
  }

  get isActive(): boolean {
    return !this.closed && !this.stopping;
  }

  private close(error: string | null): void {
    if (this.closed) return;
    this.closed = true;
    void this.teardown();
    this.callbacks.onClosed(error);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.startPromise) {
      await this.startPromise.catch(() => {});
    }
    if (!this.closed) {
      this.closed = true;
      await this.teardown();
      this.callbacks.onClosed(null);
    } else {
      await this.teardown();
    }
  }

  private async removeForward(): Promise<void> {
    const port = this.forwardPort;
    if (port === null) return;
    this.forwardPort = null;
    try {
      await adb(this.deviceId, ['forward', '--remove', `tcp:${port}`], 5000);
    } catch {
      // Already gone (device disconnected, adb restarted).
    }
  }

  private teardownPromise: Promise<void> | null = null;

  private teardown(): Promise<void> {
    if (!this.teardownPromise) this.teardownPromise = this.doTeardown();
    return this.teardownPromise;
  }

  private async doTeardown(): Promise<void> {
    for (const socket of [this.videoSocket, this.controlSocket]) {
      socket?.removeAllListeners('data');
      socket?.destroy();
    }
    this.videoSocket = null;
    this.controlSocket = null;

    await this.removeForward();

    const child = this.serverProcess;
    if (child && child.exitCode === null && child.signalCode === null) {
      // Closing the sockets makes the server exit on its own; give it a moment
      // to run its cleanup before killing the local adb client.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            resolve();
          }, 1000);
        }, 1500);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.serverProcess = null;
  }
}
