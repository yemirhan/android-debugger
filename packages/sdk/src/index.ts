import type { SdkMessage, CustomEvent, StateSnapshot, PerformanceMark } from '@android-debugger/shared';
import { DebuggerClient, type DebuggerClientOptions } from './client';
import { interceptConsole, interceptNetwork, interceptAxios, interceptZustandStore, interceptWebSocket } from './interceptors';
import { safeStringify } from './serialize';

export interface AndroidDebuggerOptions extends DebuggerClientOptions {
  interceptConsole?: boolean;
  interceptNetwork?: boolean;
  interceptWebSocket?: boolean;
}

interface ZustandStore {
  getState: () => unknown;
  subscribe: (listener: (state: unknown, prevState: unknown) => void) => () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AxiosInstance = any;

class AndroidDebuggerSDK {
  private client: DebuggerClient | null = null;
  private restoreConsole: (() => void) | null = null;
  private restoreNetwork: (() => void) | null = null;
  private restoreWebSocket: (() => void) | null = null;
  private axiosRestoreFns: (() => void)[] = [];
  private zustandRestoreFns: (() => void)[] = [];
  private performanceMarks: Map<string, number> = new Map();
  private isInitialized = false;
  private connectionListeners = new Set<(connected: boolean) => void>();
  private messageListeners = new Set<(message: SdkMessage) => void>();
  private dispatchingMessage = false;
  private unsubscribeClient: (() => void) | null = null;

  /**
   * Initialize the Android Debugger SDK
   *
   * No host/port configuration needed: the SDK connects to localhost and the
   * desktop app forwards that port to itself with `adb reverse`. Messages
   * captured before the desktop app connects are kept (up to `maxQueueSize`).
   */
  init(options: AndroidDebuggerOptions = {}): void {
    if (this.isInitialized) {
      console.warn('[AndroidDebugger] SDK is already initialized');
      return;
    }

    const {
      interceptConsole: shouldInterceptConsole = true,
      interceptNetwork: shouldInterceptNetwork = true,
      interceptWebSocket: shouldInterceptWebSocket = false,
      ...clientOptions
    } = options;

    this.client = new DebuggerClient(clientOptions);
    this.unsubscribeClient = this.client.onConnectionChange((connected) => {
      for (const listener of [...this.connectionListeners]) {
        try {
          listener(connected);
        } catch {
          // A faulty listener must not break the others
        }
      }
    });

    // Setup interceptors
    if (shouldInterceptConsole) {
      this.restoreConsole = interceptConsole((msg) => this.send(msg));
    }

    if (shouldInterceptNetwork) {
      this.restoreNetwork = interceptNetwork((msg) => this.send(msg));
    }

    if (shouldInterceptWebSocket) {
      this.restoreWebSocket = interceptWebSocket((msg) => this.send(msg));
    }

    this.isInitialized = true;
  }

  /**
   * Intercept an Axios instance for network request tracking
   * Call this for each axios instance you want to monitor
   *
   * @example
   * import axios from 'axios';
   * import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
   *
   * const api = axios.create({ baseURL: 'https://api.example.com' });
   * AndroidDebugger.interceptAxios(api);
   */
  interceptAxios(axiosInstance: AxiosInstance): () => void {
    if (!this.isInitialized) {
      console.warn('[AndroidDebugger] SDK not initialized. Call init() first.');
      return () => {};
    }

    const restore = interceptAxios(axiosInstance, (msg) => this.send(msg));
    this.axiosRestoreFns.push(restore);

    return () => {
      restore();
      this.axiosRestoreFns = this.axiosRestoreFns.filter((fn) => fn !== restore);
    };
  }

  /**
   * Intercept a Zustand store for state tracking
   * Call this for each Zustand store you want to monitor
   *
   * @example
   * import { create } from 'zustand';
   * import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
   *
   * const useStore = create((set) => ({
   *   count: 0,
   *   increment: () => set((state) => ({ count: state.count + 1 })),
   * }));
   *
   * AndroidDebugger.interceptZustandStore(useStore, 'counter');
   */
  interceptZustandStore(store: ZustandStore, name: string): () => void {
    if (!this.isInitialized) {
      console.warn('[AndroidDebugger] SDK not initialized. Call init() first.');
      return () => {};
    }

    const restore = interceptZustandStore(store, name, (msg) => this.send(msg));
    this.zustandRestoreFns.push(restore);

    return () => {
      restore();
      this.zustandRestoreFns = this.zustandRestoreFns.filter((fn) => fn !== restore);
    };
  }

  /**
   * Disconnect and cleanup
   */
  destroy(): void {
    if (!this.isInitialized) return;

    this.restoreConsole?.();
    this.restoreNetwork?.();
    this.restoreWebSocket?.();
    this.axiosRestoreFns.forEach((fn) => fn());
    this.zustandRestoreFns.forEach((fn) => fn());

    this.restoreConsole = null;
    this.restoreNetwork = null;
    this.restoreWebSocket = null;
    this.axiosRestoreFns = [];
    this.zustandRestoreFns = [];
    // Destroying the client reports the disconnect to listeners first.
    this.client?.destroy();
    this.unsubscribeClient?.();
    this.unsubscribeClient = null;
    this.client = null;
    this.isInitialized = false;
    this.performanceMarks.clear();
  }

  /**
   * Check if SDK is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if the desktop app is connected and receiving messages.
   * Always false with the `logcat` transport, which can't tell.
   */
  isConnected(): boolean {
    return this.client?.isConnected() ?? false;
  }

  /**
   * Listen for the desktop app connecting or disconnecting. Listeners survive
   * destroy() and init(). Returns a function that removes the listener.
   */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  /**
   * Observe every message the SDK captures, in the app itself (this is what
   * @yemirhan/android-debugger-ui's in-app debugger uses). Listeners get a
   * JSON snapshot taken when the message was captured, whether or not the
   * desktop app is connected. Listeners survive destroy() and init().
   * Returns a function that removes the listener.
   */
  onMessage(listener: (message: SdkMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
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
    if (!this.client) return;
    this.client.send(message);

    // Messages captured while a listener runs (e.g. it calls console.log)
    // still go to the desktop app but aren't dispatched again, which would loop.
    if (this.messageListeners.size === 0 || this.dispatchingMessage) return;
    this.dispatchingMessage = true;
    try {
      const snapshot = JSON.parse(safeStringify(message)) as SdkMessage;
      for (const listener of [...this.messageListeners]) {
        try {
          listener(snapshot);
        } catch {
          // A faulty listener must not break the others or the host app
        }
      }
    } catch {
      // Ignore - debugging must never break the host app
    } finally {
      this.dispatchingMessage = false;
    }
  }
}

// Export singleton instance
export const AndroidDebugger = new AndroidDebuggerSDK();

// Re-export client and transports
export { DebuggerClient, type DebuggerClientOptions, type TransportKind } from './client';
export { WebSocketTransport, LogcatTransport, type Transport, type WebSocketTransportOptions } from './transports';
export { SDK_VERSION } from './version';

// Re-export interceptors for advanced usage
export { interceptAxios, interceptNetwork, interceptConsole, interceptZustandStore, interceptWebSocket } from './interceptors';
