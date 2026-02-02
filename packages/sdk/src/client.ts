import type { SdkMessage } from '@android-debugger/shared';
import { LogcatTransport, type ITransport, type TransportConfig, shouldUseSocket } from './transports';

/**
 * DebuggerClient sends SDK messages via configurable transports.
 *
 * Transport routing strategy:
 * - Console logs → logcat (simple text, low overhead)
 * - Network/State/Custom → socket when available (large payloads, low latency)
 * - Fallback to logcat when socket is disconnected
 */
export class DebuggerClient {
  private logcatTransport: ITransport;
  private socketTransport: ITransport | null = null;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();

  constructor(config?: Partial<TransportConfig>) {
    this.logcatTransport = config?.logcatTransport ?? new LogcatTransport();
    this.socketTransport = config?.socketTransport ?? null;

    // Listen for socket connection changes
    if (this.socketTransport?.onConnectionChange) {
      this.socketTransport.onConnectionChange((connected) => {
        this.notifyConnectionChange(connected);
      });
    }
  }

  /**
   * Set the socket transport after initialization.
   * This allows the native package to inject the socket transport.
   */
  setSocketTransport(transport: ITransport | null): void {
    // Clean up old transport
    if (this.socketTransport?.destroy) {
      this.socketTransport.destroy();
    }

    this.socketTransport = transport;

    // Listen for connection changes on new transport
    if (transport?.onConnectionChange) {
      transport.onConnectionChange((connected) => {
        this.notifyConnectionChange(connected);
      });
    }
  }

  /**
   * Get the current socket transport
   */
  getSocketTransport(): ITransport | null {
    return this.socketTransport;
  }

  /**
   * Check if socket transport is connected
   */
  isSocketConnected(): boolean {
    return this.socketTransport?.isConnected() ?? false;
  }

  /**
   * Register a callback for connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach((callback) => callback(connected));
  }

  /**
   * Send a message to the desktop app via the appropriate transport.
   *
   * Routing logic:
   * 1. If socket is available and connected, and message type prefers socket → use socket
   * 2. Otherwise → use logcat (always available)
   */
  send(message: SdkMessage): void {
    const useSocket =
      shouldUseSocket(message.type) &&
      this.socketTransport?.isConnected();

    if (useSocket && this.socketTransport) {
      this.socketTransport.send(message);
    } else {
      this.logcatTransport.send(message);
    }
  }

  /**
   * Force send via logcat transport (useful for console logs)
   */
  sendViaLogcat(message: SdkMessage): void {
    this.logcatTransport.send(message);
  }

  /**
   * Force send via socket transport if available
   * Falls back to logcat if socket is not connected
   */
  sendViaSocket(message: SdkMessage): void {
    if (this.socketTransport?.isConnected()) {
      this.socketTransport.send(message);
    } else {
      this.logcatTransport.send(message);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.logcatTransport.destroy?.();
    this.socketTransport?.destroy?.();
    this.socketTransport = null;
    this.connectionListeners.clear();
  }
}
