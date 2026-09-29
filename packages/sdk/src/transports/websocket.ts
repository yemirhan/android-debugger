import type { DesktopToSdkFrame, SdkHelloFrame, SdkMessage } from '@android-debugger/shared';
import { SDK_BRIDGE_DEVICE_PORT, SDK_BRIDGE_PROTOCOL_VERSION } from '@android-debugger/shared';
import { safeStringify, sdkNotice } from '../serialize';
import { SDK_VERSION } from '../version';
import type { Transport } from './types';

// Captured at module load, before interceptWebSocket can replace the global:
// the SDK's own connection must never be reported as app traffic.
const NativeWebSocket: typeof WebSocket | undefined =
  typeof globalThis.WebSocket === 'function' ? globalThis.WebSocket : undefined;

export interface WebSocketTransportOptions {
  /** Default: localhost (the desktop app forwards the port with `adb reverse`). */
  host?: string;
  /** Default: 8347. Only change this if the desktop app uses a different port. */
  port?: number;
  /** Messages kept while the desktop app is not connected. Default: 1000. */
  maxQueueSize?: number;
}

const DEFAULT_MAX_QUEUE_SIZE = 1000;
const MAX_QUEUE_CHARS = 8 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 4 * 1024 * 1024;
const MAX_FRAME_CHARS = 512 * 1024;
const FLUSH_DELAY_MS = 50;
const HANDSHAKE_TIMEOUT_MS = 5000;
const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 5000;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Sends SDK messages to the desktop app over a WebSocket to localhost, which
 * the desktop app maps to itself with `adb reverse`. Nothing is written to
 * console or logcat, so the app's own logs stay readable.
 *
 * Messages are serialized when they happen and queued (bounded) until the
 * desktop app answers the handshake, so startup activity isn't lost when the
 * app launches before the desktop app is watching. The connection retries
 * with backoff for as long as the transport lives.
 */
export class WebSocketTransport implements Transport {
  private readonly url: string;
  private readonly maxQueueSize: number;
  private readonly sessionId = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  private readonly startedAt = Date.now();

  private socket: WebSocket | null = null;
  private welcomed = false;
  private destroyed = false;
  private queue: string[] = [];
  private queueChars = 0;
  private dropped = 0;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: Timer | null = null;
  private flushTimer: Timer | null = null;
  private handshakeTimer: Timer | null = null;
  private listeners = new Set<(connected: boolean) => void>();

  constructor(options: WebSocketTransportOptions = {}) {
    const host = options.host || 'localhost';
    const port = options.port ?? SDK_BRIDGE_DEVICE_PORT;
    this.url = `ws://${host}:${port}`;
    this.maxQueueSize = Math.max(1, options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE);
    this.connect();
  }

  send(message: SdkMessage): void {
    if (this.destroyed) return;
    // Never let serialization escape into host app code (this runs inside
    // console, fetch, XHR, zustand and redux hooks).
    try {
      let json = safeStringify(message);
      if (json.length > MAX_MESSAGE_CHARS) {
        json = safeStringify(
          sdkNotice('warn', `Dropped a ${message.type} message: too large (${json.length} characters)`)
        );
      }
      this.enqueue(json);
      this.scheduleFlush();
    } catch {
      // Ignore - debugging must never break the host app
    }
  }

  isConnected(): boolean {
    return this.welcomed;
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.closeSocket();
    this.queue = [];
    this.queueChars = 0;
    this.listeners.clear();
  }

  private enqueue(json: string): void {
    this.queue.push(json);
    this.queueChars += json.length;
    while (this.queue.length > this.maxQueueSize || this.queueChars > MAX_QUEUE_CHARS) {
      this.queueChars -= this.queue.shift()!.length;
      this.dropped++;
    }
  }

  private scheduleFlush(): void {
    if (!this.welcomed || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  private flush(): void {
    const socket = this.socket;
    if (!socket || !this.welcomed) return;

    if (this.dropped > 0) {
      const notice = safeStringify(
        sdkNotice(
          'warn',
          `${this.dropped} earlier message${this.dropped === 1 ? ' was' : 's were'} dropped while Android Debugger was not connected`
        )
      );
      this.dropped = 0;
      this.queue.unshift(notice);
      this.queueChars += notice.length;
    }

    try {
      while (this.queue.length > 0) {
        // Pre-serialized messages are joined as-is; the first one always fits.
        let count = 0;
        let chars = 0;
        while (count < this.queue.length && (count === 0 || chars + this.queue[count].length <= MAX_FRAME_CHARS)) {
          chars += this.queue[count].length;
          count++;
        }
        socket.send(`{"type":"batch","messages":[${this.queue.slice(0, count).join(',')}]}`);
        // Only forget messages once the socket accepted them.
        this.queue.splice(0, count);
        this.queueChars -= chars;
      }
    } catch {
      // The socket died mid-flush; unsent messages stay queued for the next connection.
      this.handleDisconnect(socket);
    }
  }

  private connect(): void {
    this.retryTimer = null;
    if (this.destroyed || !NativeWebSocket) return;

    let socket: WebSocket;
    try {
      socket = new NativeWebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      const hello: SdkHelloFrame = {
        type: 'hello',
        protocol: SDK_BRIDGE_PROTOCOL_VERSION,
        sdkVersion: SDK_VERSION,
        sessionId: this.sessionId,
        startedAt: this.startedAt,
      };
      try {
        socket.send(JSON.stringify(hello));
      } catch {
        this.handleDisconnect(socket);
        return;
      }
      // Something else may be listening on this port; only a welcome proves
      // it's Android Debugger.
      this.handshakeTimer = setTimeout(() => this.handleDisconnect(socket), HANDSHAKE_TIMEOUT_MS);
    };

    socket.onmessage = (event: MessageEvent) => {
      if (this.socket !== socket || this.welcomed) return;
      if (parseFrame(event.data)?.type !== 'welcome') return;
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
      this.welcomed = true;
      this.retryMs = MIN_RETRY_MS;
      this.notify(true);
      this.flush();
    };

    // React Native fires `close` after `error`; handle both in case a platform doesn't.
    socket.onerror = () => this.handleDisconnect(socket);
    socket.onclose = () => this.handleDisconnect(socket);
  }

  private handleDisconnect(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.closeSocket();
    this.scheduleReconnect();
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.handshakeTimer = null;
    this.flushTimer = null;

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Already closed
      }
    }

    if (this.welcomed) {
      this.welcomed = false;
      this.notify(false);
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.retryTimer) return;
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  private notify(connected: boolean): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(connected);
      } catch {
        // A faulty listener must not break the transport
      }
    }
  }
}

function parseFrame(data: unknown): DesktopToSdkFrame | null {
  if (typeof data !== 'string') return null;
  try {
    const frame = JSON.parse(data) as DesktopToSdkFrame | null;
    return frame && typeof frame === 'object' && typeof frame.type === 'string' ? frame : null;
  } catch {
    return null;
  }
}
