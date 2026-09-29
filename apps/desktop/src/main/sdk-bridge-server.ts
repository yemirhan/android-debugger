import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type {
  DesktopWelcomeFrame,
  SdkBridgeClient,
  SdkMessage,
  SdkMessageType,
  SdkToDesktopFrame,
} from '@android-debugger/shared';

/**
 * WebSocket server the React Native SDK (2+) connects to. SdkBridge points a
 * device port at it with `adb reverse`; this module only deals with sockets,
 * so it can be tested without a device. Type-only imports plus `ws` keep it
 * loadable by node:test.
 *
 * Protocol: the SDK sends `hello`, waits for `welcome`, then sends `batch`
 * frames. Anything else closes the connection.
 */

const SDK_MESSAGE_TYPES: ReadonlySet<SdkMessageType> = new Set<SdkMessageType>([
  'console',
  'network',
  'state',
  'performance',
  'custom',
  'zustand',
  'websocket',
]);

// The SDK caps frames at ~512K characters; this leaves room for multi-byte text.
export const MAX_SDK_FRAME_BYTES = 16 * 1024 * 1024;

export const CLOSE_HANDSHAKE_FAILED = 4000;
export const CLOSE_UNSUPPORTED_PROTOCOL = 4001;

/**
 * Browsers can open WebSockets to 127.0.0.1 from any page, so only accept
 * clients without an Origin (native) or with a loopback one. React Native
 * sends `Origin: http://localhost:<port>` by default.
 */
export function isAllowedSdkOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

function isSdkMessage(value: unknown): value is SdkMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<SdkMessage>;
  return (
    typeof message.type === 'string' &&
    SDK_MESSAGE_TYPES.has(message.type) &&
    typeof message.timestamp === 'number' &&
    typeof message.payload === 'object' &&
    message.payload !== null
  );
}

/**
 * Parses a frame from the SDK. Batch messages of unknown types (from a newer
 * SDK) or with a broken shape are dropped instead of failing the whole batch.
 */
export function parseSdkFrame(data: string): SdkToDesktopFrame | null {
  let frame: unknown;
  try {
    frame = JSON.parse(data);
  } catch {
    return null;
  }
  if (!frame || typeof frame !== 'object') return null;
  const candidate = frame as Record<string, unknown>;

  if (candidate.type === 'hello') {
    if (typeof candidate.protocol !== 'number' || typeof candidate.sessionId !== 'string') return null;
    return {
      type: 'hello',
      protocol: candidate.protocol,
      sessionId: candidate.sessionId.slice(0, 64),
      sdkVersion: typeof candidate.sdkVersion === 'string' ? candidate.sdkVersion.slice(0, 32) : 'unknown',
      startedAt: typeof candidate.startedAt === 'number' ? candidate.startedAt : Date.now(),
    };
  }
  if (candidate.type === 'batch' && Array.isArray(candidate.messages)) {
    return { type: 'batch', messages: candidate.messages.filter(isSdkMessage) };
  }
  return null;
}

/** True when `adb reverse --list` output maps the device port to `hostPort`. */
export function reverseListMapsPort(stdout: string, devicePort: number, hostPort: number): boolean {
  return stdout.split(/\r?\n/).some((line) => {
    const parts = line.trim().split(/\s+/);
    return parts.length >= 2 && parts[parts.length - 2] === `tcp:${devicePort}` && parts[parts.length - 1] === `tcp:${hostPort}`;
  });
}

export interface SdkBridgeServerOptions {
  protocolVersion: number;
  onMessages: (messages: SdkMessage[], client: SdkBridgeClient) => void;
  onClientsChanged: (clients: SdkBridgeClient[]) => void;
  handshakeTimeoutMs?: number;
  heartbeatMs?: number;
}

interface Connection {
  socket: WebSocket;
  client: SdkBridgeClient | null;
  alive: boolean;
}

export class SdkBridgeServer {
  private readonly wss: WebSocketServer;
  private readonly options: SdkBridgeServerOptions;
  private readonly connections = new Set<Connection>();
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private nextClientId = 0;
  private closed = false;

  /** Listens on an ephemeral loopback port. */
  static listen(options: SdkBridgeServerOptions): Promise<SdkBridgeServer> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        host: '127.0.0.1',
        port: 0,
        maxPayload: MAX_SDK_FRAME_BYTES,
        verifyClient: ({ req }: { req: IncomingMessage }) => isAllowedSdkOrigin(req.headers.origin),
      });
      const onError = (error: Error) => {
        wss.close();
        reject(error);
      };
      wss.once('error', onError);
      wss.once('listening', () => {
        wss.off('error', onError);
        resolve(new SdkBridgeServer(wss, options));
      });
    });
  }

  private constructor(wss: WebSocketServer, options: SdkBridgeServerOptions) {
    this.wss = wss;
    this.options = options;
    wss.on('connection', (socket) => this.accept(socket));
    wss.on('error', (error) => console.error('[SdkBridge] Server error:', error));

    // Pings are answered by the WebSocket stack itself (OkHttp on Android),
    // so a missing pong means the app or the adb tunnel is gone.
    this.heartbeat = setInterval(() => {
      for (const connection of this.connections) {
        if (!connection.alive) {
          connection.socket.terminate();
          continue;
        }
        connection.alive = false;
        connection.socket.ping();
      }
    }, options.heartbeatMs ?? 15_000);
  }

  get port(): number {
    return (this.wss.address() as AddressInfo).port;
  }

  get clients(): SdkBridgeClient[] {
    const clients: SdkBridgeClient[] = [];
    for (const connection of this.connections) if (connection.client) clients.push(connection.client);
    return clients;
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    clearInterval(this.heartbeat);
    for (const { socket } of this.connections) socket.close(1001, 'Android Debugger stopped listening');
    return new Promise((resolve) => {
      this.wss.close(() => resolve());
      // Don't wait on sockets whose peer never finishes the close handshake.
      setTimeout(() => {
        for (const { socket } of this.connections) socket.terminate();
      }, 1000).unref();
    });
  }

  private accept(socket: WebSocket): void {
    const connection: Connection = { socket, client: null, alive: true };
    this.connections.add(connection);

    const handshakeTimer = setTimeout(() => {
      socket.close(CLOSE_HANDSHAKE_FAILED, 'Expected hello');
    }, this.options.handshakeTimeoutMs ?? 5000);

    socket.on('pong', () => {
      connection.alive = true;
    });

    socket.on('message', (data: RawData, isBinary: boolean) => {
      connection.alive = true;
      const frame = isBinary ? null : parseSdkFrame(data.toString());

      if (!connection.client) {
        clearTimeout(handshakeTimer);
        if (frame?.type !== 'hello') {
          socket.close(CLOSE_HANDSHAKE_FAILED, 'Expected hello');
          return;
        }
        if (frame.protocol !== this.options.protocolVersion) {
          socket.close(
            CLOSE_UNSUPPORTED_PROTOCOL,
            `Unsupported protocol ${frame.protocol}; this Android Debugger speaks ${this.options.protocolVersion}`
          );
          return;
        }
        connection.client = {
          id: `sdk-${++this.nextClientId}`,
          sessionId: frame.sessionId,
          sdkVersion: frame.sdkVersion,
          connectedAt: Date.now(),
        };
        const welcome: DesktopWelcomeFrame = { type: 'welcome', protocol: this.options.protocolVersion };
        socket.send(JSON.stringify(welcome));
        this.options.onClientsChanged(this.clients);
        return;
      }

      if (frame?.type === 'batch' && frame.messages.length > 0) {
        this.options.onMessages(frame.messages, connection.client);
      }
    });

    socket.on('close', () => {
      clearTimeout(handshakeTimer);
      this.connections.delete(connection);
      if (connection.client && !this.closed) this.options.onClientsChanged(this.clients);
    });
    socket.on('error', () => {
      // `close` follows; nothing else to do.
    });
  }
}
