import type { SdkMessage, CustomEvent, StateSnapshot, PerformanceMark } from '@android-debugger/shared';
import { DEFAULT_WS_PORT } from '@android-debugger/shared';
import { DebuggerClient, ClientOptions } from './client';
import { interceptConsole, interceptNetwork } from './interceptors';

export interface AndroidDebuggerOptions {
  host: string;
  port?: number;
  autoReconnect?: boolean;
  interceptConsole?: boolean;
  interceptNetwork?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

class AndroidDebuggerSDK {
  private client: DebuggerClient | null = null;
  private restoreConsole: (() => void) | null = null;
  private restoreNetwork: (() => void) | null = null;
  private performanceMarks: Map<string, number> = new Map();
  private isInitialized = false;

  /**
   * Initialize the Android Debugger SDK
   */
  init(options: AndroidDebuggerOptions): void {
    if (this.isInitialized) {
      console.warn('[AndroidDebugger] SDK is already initialized');
      return;
    }

    const {
      host,
      port = DEFAULT_WS_PORT,
      autoReconnect = true,
      interceptConsole: shouldInterceptConsole = true,
      interceptNetwork: shouldInterceptNetwork = true,
      onConnect,
      onDisconnect,
    } = options;

    const clientOptions: ClientOptions = {
      host,
      port,
      autoReconnect,
      onConnect: () => {
        console.log('[AndroidDebugger] Connected to desktop app');
        onConnect?.();
      },
      onDisconnect: () => {
        console.log('[AndroidDebugger] Disconnected from desktop app');
        onDisconnect?.();
      },
      onError: (error) => {
        console.error('[AndroidDebugger] Connection error:', error.message);
      },
    };

    this.client = new DebuggerClient(clientOptions);

    // Setup interceptors
    if (shouldInterceptConsole) {
      this.restoreConsole = interceptConsole((msg) => this.send(msg));
    }

    if (shouldInterceptNetwork) {
      this.restoreNetwork = interceptNetwork((msg) => this.send(msg));
    }

    // Connect
    this.client.connect();
    this.isInitialized = true;
  }

  /**
   * Disconnect and cleanup
   */
  destroy(): void {
    if (!this.isInitialized) return;

    this.restoreConsole?.();
    this.restoreNetwork?.();
    this.client?.disconnect();

    this.restoreConsole = null;
    this.restoreNetwork = null;
    this.client = null;
    this.isInitialized = false;
    this.performanceMarks.clear();
  }

  /**
   * Check if SDK is connected to desktop app
   */
  isConnected(): boolean {
    return this.client?.getConnectionStatus() ?? false;
  }

  /**
   * Send a custom event to the desktop app
   */
  trackEvent(name: string, data?: unknown): void {
    const event: CustomEvent = {
      name,
      data: data ?? {},
      timestamp: Date.now(),
    };

    this.send({
      type: 'custom',
      timestamp: Date.now(),
      payload: event,
    });
  }

  /**
   * Send a state snapshot to the desktop app
   */
  sendState(name: string, state: unknown): void {
    const snapshot: StateSnapshot = {
      name,
      state,
      timestamp: Date.now(),
    };

    this.send({
      type: 'state',
      timestamp: Date.now(),
      payload: snapshot,
    });
  }

  /**
   * Start a performance measurement
   */
  markStart(name: string): void {
    this.performanceMarks.set(name, Date.now());
  }

  /**
   * End a performance measurement and send the result
   */
  markEnd(name: string): void {
    const startTime = this.performanceMarks.get(name);
    if (!startTime) {
      console.warn(`[AndroidDebugger] No start mark found for "${name}"`);
      return;
    }

    const duration = Date.now() - startTime;
    this.performanceMarks.delete(name);

    const mark: PerformanceMark = {
      name,
      startTime,
      duration,
    };

    this.send({
      type: 'performance',
      timestamp: Date.now(),
      payload: mark,
    });
  }

  /**
   * Create a Redux middleware for state tracking
   */
  createReduxMiddleware() {
    return (store: any) => (next: any) => (action: any) => {
      const result = next(action);

      this.trackEvent(`redux:${action.type}`, {
        action,
        timestamp: Date.now(),
      });

      // Send state snapshot
      this.sendState('redux', store.getState());

      return result;
    };
  }

  private send(message: SdkMessage): void {
    if (this.client) {
      this.client.send(message);
    }
  }
}

// Export singleton instance
export const AndroidDebugger = new AndroidDebuggerSDK();

// Re-export client
export { DebuggerClient } from './client';
export type { ClientOptions } from './client';
