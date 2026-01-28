import type { SdkMessage, CustomEvent, StateSnapshot, PerformanceMark } from '@android-debugger/shared';
import { DebuggerClient } from './client';
import { interceptConsole, interceptNetwork, interceptAxios } from './interceptors';

export interface AndroidDebuggerOptions {
  interceptConsole?: boolean;
  interceptNetwork?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AxiosInstance = any;

class AndroidDebuggerSDK {
  private client: DebuggerClient | null = null;
  private restoreConsole: (() => void) | null = null;
  private restoreNetwork: (() => void) | null = null;
  private axiosRestoreFns: (() => void)[] = [];
  private performanceMarks: Map<string, number> = new Map();
  private isInitialized = false;

  /**
   * Initialize the Android Debugger SDK
   *
   * No host/port configuration needed - messages are sent via logcat
   * and captured by the desktop app through ADB.
   */
  init(options: AndroidDebuggerOptions = {}): void {
    if (this.isInitialized) {
      console.warn('[AndroidDebugger] SDK is already initialized');
      return;
    }

    const {
      interceptConsole: shouldInterceptConsole = true,
      interceptNetwork: shouldInterceptNetwork = true,
    } = options;

    this.client = new DebuggerClient();

    // Setup interceptors
    if (shouldInterceptConsole) {
      this.restoreConsole = interceptConsole((msg) => this.send(msg));
    }

    if (shouldInterceptNetwork) {
      this.restoreNetwork = interceptNetwork((msg) => this.send(msg));
    }

    this.isInitialized = true;
    console.log('[AndroidDebugger] SDK initialized - messages will be sent via logcat');
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
   * Disconnect and cleanup
   */
  destroy(): void {
    if (!this.isInitialized) return;

    this.restoreConsole?.();
    this.restoreNetwork?.();
    this.axiosRestoreFns.forEach((fn) => fn());

    this.restoreConsole = null;
    this.restoreNetwork = null;
    this.axiosRestoreFns = [];
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

// Re-export interceptors for advanced usage
export { interceptAxios, interceptNetwork, interceptConsole } from './interceptors';
