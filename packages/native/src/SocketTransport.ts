import type { SdkMessage } from '@android-debugger/shared';
import type { ITransport } from '@yemirhan/android-debugger-sdk';
import { nativeDebugServer, NativeDebugServer, type Subscription } from './NativeDebugServer';

const MAX_QUEUE_SIZE = 100;

/**
 * SocketTransport implements ITransport using the native TCP server.
 * Provides message queuing when disconnected and auto-flush on reconnect.
 */
export class SocketTransport implements ITransport {
  readonly name = 'socket';

  private messageQueue: SdkMessage[] = [];
  private connectionListeners = new Set<(connected: boolean) => void>();
  private subscriptions: Subscription[] = [];
  private initialized = false;

  constructor(private readonly port: number = 8765) {}

  /**
   * Check if the native module is available
   */
  static isAvailable(): boolean {
    return NativeDebugServer.isAvailable();
  }

  /**
   * Initialize the socket transport by starting the native server.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!SocketTransport.isAvailable()) {
      console.warn('[SocketTransport] Native module not available - running in JS-only mode');
      return;
    }

    try {
      // Subscribe to connection events
      this.subscriptions.push(
        nativeDebugServer.addClientConnectedListener(() => {
          console.log('[SocketTransport] Desktop client connected');
          this.notifyConnectionChange(true);
          this.flushMessageQueue();
        })
      );

      this.subscriptions.push(
        nativeDebugServer.addClientDisconnectedListener(() => {
          console.log('[SocketTransport] Desktop client disconnected');
          this.notifyConnectionChange(false);
        })
      );

      this.subscriptions.push(
        nativeDebugServer.addErrorListener((event) => {
          console.error('[SocketTransport] Server error:', event.error);
        })
      );

      // Start the server
      await nativeDebugServer.startServer(this.port);
      this.initialized = true;
      console.log(`[SocketTransport] Server started on port ${this.port}`);
    } catch (error) {
      console.error('[SocketTransport] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Check if a client is connected.
   */
  isConnected(): boolean {
    if (!SocketTransport.isAvailable()) {
      return false;
    }
    return nativeDebugServer.isClientConnected();
  }

  /**
   * Send a message via the socket transport.
   * If not connected, the message is queued (up to MAX_QUEUE_SIZE).
   */
  send(message: SdkMessage): void {
    if (!SocketTransport.isAvailable()) {
      return;
    }

    if (!this.isConnected()) {
      this.queueMessage(message);
      return;
    }

    this.sendMessage(message);
  }

  /**
   * Register a callback for connection status changes.
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Clean up resources.
   */
  async destroy(): Promise<void> {
    // Remove all subscriptions
    this.subscriptions.forEach((sub) => sub.remove());
    this.subscriptions = [];

    // Stop the server
    if (SocketTransport.isAvailable() && this.initialized) {
      try {
        await nativeDebugServer.stopServer();
      } catch (error) {
        console.error('[SocketTransport] Error stopping server:', error);
      }
    }

    this.messageQueue = [];
    this.connectionListeners.clear();
    this.initialized = false;
  }

  private queueMessage(message: SdkMessage): void {
    if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
      // Remove oldest message to make room
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
  }

  private async flushMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      if (message) {
        await this.sendMessage(message);
      }
    }
  }

  private async sendMessage(message: SdkMessage): Promise<void> {
    try {
      const json = JSON.stringify(message);
      await nativeDebugServer.sendMessage(json);
    } catch (error) {
      console.error('[SocketTransport] Error sending message:', error);
      // Re-queue the message
      this.queueMessage(message);
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach((callback) => {
      try {
        callback(connected);
      } catch (error) {
        console.error('[SocketTransport] Error in connection listener:', error);
      }
    });
  }
}
