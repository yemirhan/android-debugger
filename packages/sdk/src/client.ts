import type { SdkMessage } from '@android-debugger/shared';
import { LogcatTransport, WebSocketTransport, type Transport, type WebSocketTransportOptions } from './transports';

export type TransportKind = 'websocket' | 'logcat';

export interface DebuggerClientOptions extends WebSocketTransportOptions {
  /**
   * How messages reach the desktop app.
   * - `websocket` (default): a local socket forwarded by `adb reverse`. Keeps
   *   Metro, React Native DevTools and logcat free of SDK traffic.
   * - `logcat`: the SDK 1.x transport. Every message is also printed to the
   *   app's logs; only use it when `adb reverse` isn't available.
   */
  transport?: TransportKind;
}

/**
 * Sends SDK messages to the desktop app through the configured transport.
 */
export class DebuggerClient {
  private transport: Transport;

  constructor(options: DebuggerClientOptions = {}) {
    const { transport = 'websocket', ...socketOptions } = options;
    this.transport = transport === 'logcat' ? new LogcatTransport() : new WebSocketTransport(socketOptions);
  }

  send(message: SdkMessage): void {
    this.transport.send(message);
  }

  isConnected(): boolean {
    return this.transport.isConnected();
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    return this.transport.onConnectionChange(listener);
  }

  destroy(): void {
    this.transport.destroy();
  }
}
