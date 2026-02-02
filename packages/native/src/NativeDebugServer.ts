import { LegacyEventEmitter, NativeModulesProxy, type EventSubscription } from 'expo-modules-core';

export type { EventSubscription };

// Re-export as Subscription for backwards compatibility
export type Subscription = EventSubscription;

// Import the native module
const AndroidDebuggerModule = NativeModulesProxy.AndroidDebugger;

// Create event emitter for the native module
const emitter = AndroidDebuggerModule ? new LegacyEventEmitter(AndroidDebuggerModule) : null;

export interface ServerStatus {
  isRunning: boolean;
  isClientConnected: boolean;
  port: number;
}

export interface ClientConnectedEvent {
  timestamp: number;
}

export interface ClientDisconnectedEvent {
  timestamp: number;
}

export interface MessageReceivedEvent {
  message: string;
  timestamp: number;
}

export interface ServerErrorEvent {
  error: string;
  timestamp: number;
}

/**
 * TypeScript wrapper for the native AndroidDebugger module.
 * Provides a TCP server for communication with the desktop app.
 */
export class NativeDebugServer {
  private static instance: NativeDebugServer | null = null;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): NativeDebugServer {
    if (!NativeDebugServer.instance) {
      NativeDebugServer.instance = new NativeDebugServer();
    }
    return NativeDebugServer.instance;
  }

  /**
   * Check if the native module is available
   */
  static isAvailable(): boolean {
    return AndroidDebuggerModule != null;
  }

  /**
   * Start the debug server on the specified port.
   * @param port The port to listen on (default: 8765)
   */
  async startServer(port: number = 8765): Promise<{ success: boolean; port: number }> {
    if (!AndroidDebuggerModule) {
      throw new Error('AndroidDebugger native module is not available');
    }
    return AndroidDebuggerModule.startServer(port);
  }

  /**
   * Stop the debug server.
   */
  async stopServer(): Promise<{ success: boolean }> {
    if (!AndroidDebuggerModule) {
      throw new Error('AndroidDebugger native module is not available');
    }
    return AndroidDebuggerModule.stopServer();
  }

  /**
   * Send a message to the connected desktop client.
   * @param json The JSON string message to send
   */
  async sendMessage(json: string): Promise<{ success: boolean }> {
    if (!AndroidDebuggerModule) {
      throw new Error('AndroidDebugger native module is not available');
    }
    return AndroidDebuggerModule.sendMessage(json);
  }

  /**
   * Check if the server is currently running.
   */
  isServerRunning(): boolean {
    if (!AndroidDebuggerModule) {
      return false;
    }
    return AndroidDebuggerModule.isServerRunning();
  }

  /**
   * Check if a client is currently connected.
   */
  isClientConnected(): boolean {
    if (!AndroidDebuggerModule) {
      return false;
    }
    return AndroidDebuggerModule.isClientConnected();
  }

  /**
   * Get the current server status.
   */
  getStatus(): ServerStatus {
    if (!AndroidDebuggerModule) {
      return {
        isRunning: false,
        isClientConnected: false,
        port: 0,
      };
    }
    return AndroidDebuggerModule.getStatus();
  }

  /**
   * Subscribe to client connected events.
   */
  addClientConnectedListener(listener: (event: ClientConnectedEvent) => void): EventSubscription {
    if (!emitter) {
      return { remove: () => {} };
    }
    return emitter.addListener('onClientConnected', listener);
  }

  /**
   * Subscribe to client disconnected events.
   */
  addClientDisconnectedListener(listener: (event: ClientDisconnectedEvent) => void): EventSubscription {
    if (!emitter) {
      return { remove: () => {} };
    }
    return emitter.addListener('onClientDisconnected', listener);
  }

  /**
   * Subscribe to message received events.
   */
  addMessageReceivedListener(listener: (event: MessageReceivedEvent) => void): EventSubscription {
    if (!emitter) {
      return { remove: () => {} };
    }
    return emitter.addListener('onMessageReceived', listener);
  }

  /**
   * Subscribe to server error events.
   */
  addErrorListener(listener: (event: ServerErrorEvent) => void): EventSubscription {
    if (!emitter) {
      return { remove: () => {} };
    }
    return emitter.addListener('onServerError', listener);
  }
}

// Export singleton instance
export const nativeDebugServer = NativeDebugServer.getInstance();
