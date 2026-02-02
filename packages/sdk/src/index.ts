import type { SdkMessage, CustomEvent, StateSnapshot, PerformanceMark } from '@android-debugger/shared';
import { DebuggerClient } from './client';
import { interceptConsole, interceptNetwork, interceptAxios, interceptZustandStore, interceptWebSocket } from './interceptors';
import type { ITransport, TransportConfig } from './transports';

export interface AndroidDebuggerOptions {
  interceptConsole?: boolean;
  interceptNetwork?: boolean;
  interceptWebSocket?: boolean;
  /** Optional custom transport configuration */
  transport?: Partial<TransportConfig>;
}

interface ZustandStore {
  getState: () => unknown;
  subscribe: (listener: (state: unknown, prevState: unknown) => void) => () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AxiosInstance = any;

// Command types for bi-directional communication
export interface Command {
  id: string;
  type: string;
  payload?: unknown;
}

export interface CommandResponse {
  id: string;
  type: 'response';
  success: boolean;
  data?: unknown;
  error?: string;
}

export type CommandHandler = (payload: unknown) => Promise<unknown> | unknown;

class AndroidDebuggerSDK {
  private client: DebuggerClient | null = null;
  private restoreConsole: (() => void) | null = null;
  private restoreNetwork: (() => void) | null = null;
  private restoreWebSocket: (() => void) | null = null;
  private axiosRestoreFns: (() => void)[] = [];
  private zustandRestoreFns: (() => void)[] = [];
  private performanceMarks: Map<string, number> = new Map();
  private isInitialized = false;
  private commandHandlers: Map<string, CommandHandler> = new Map();
  private commandListeners: Set<(command: Command) => void> = new Set();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();

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
      interceptWebSocket: shouldInterceptWebSocket = false,
      transport,
    } = options;

    this.client = new DebuggerClient(transport);

    // Listen for connection changes from the client
    this.client.onConnectionChange((connected) => {
      this.notifyConnectionChange(connected);
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

    // Register built-in command handlers
    this.registerBuiltInCommands();

    this.isInitialized = true;
    console.log('[AndroidDebugger] SDK initialized - messages will be sent via logcat');
  }

  /**
   * Get the internal client instance.
   * Useful for native transport injection.
   */
  getClient(): DebuggerClient | null {
    return this.client;
  }

  /**
   * Set a custom socket transport.
   * This is called by the native package to inject the socket transport.
   */
  setSocketTransport(transport: ITransport | null): void {
    if (!this.client) {
      console.warn('[AndroidDebugger] SDK not initialized. Call init() first.');
      return;
    }
    this.client.setSocketTransport(transport);
  }

  /**
   * Check if socket transport is connected
   */
  isSocketConnected(): boolean {
    return this.client?.isSocketConnected() ?? false;
  }

  /**
   * Register a callback for connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    // Also listen to client directly
    const clientUnsub = this.client?.onConnectionChange(callback);
    return () => {
      this.connectionListeners.delete(callback);
      clientUnsub?.();
    };
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach((callback) => callback(connected));
  }

  /**
   * Register a command handler for desktop → app communication
   */
  registerCommand(type: string, handler: CommandHandler): () => void {
    this.commandHandlers.set(type, handler);
    return () => {
      this.commandHandlers.delete(type);
    };
  }

  /**
   * Register a listener for all incoming commands
   */
  onCommand(callback: (command: Command) => void): () => void {
    this.commandListeners.add(callback);
    return () => {
      this.commandListeners.delete(callback);
    };
  }

  /**
   * Handle an incoming command from the desktop app.
   * This is called by the native transport when a command is received.
   */
  async handleCommand(command: Command): Promise<CommandResponse> {
    // Notify listeners
    this.commandListeners.forEach((callback) => callback(command));

    const handler = this.commandHandlers.get(command.type);
    if (!handler) {
      return {
        id: command.id,
        type: 'response',
        success: false,
        error: `Unknown command type: ${command.type}`,
      };
    }

    try {
      const data = await handler(command.payload);
      return {
        id: command.id,
        type: 'response',
        success: true,
        data,
      };
    } catch (error) {
      return {
        id: command.id,
        type: 'response',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private registerBuiltInCommands(): void {
    // Ping command for health check
    this.registerCommand('ping', () => ({
      timestamp: Date.now(),
      sdk: 'android-debugger-sdk',
    }));

    // Get state command - returns registered state snapshots
    this.registerCommand('get_state', () => {
      // This would be populated by state interceptors
      return { message: 'State query supported - register state handlers' };
    });

    // Set config command - update SDK config at runtime
    this.registerCommand('set_config', (payload: unknown) => {
      console.log('[AndroidDebugger] Config update:', payload);
      return { success: true };
    });
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
    this.client?.destroy();
    this.client = null;
    this.isInitialized = false;
    this.performanceMarks.clear();
    this.commandHandlers.clear();
    this.commandListeners.clear();
    this.connectionListeners.clear();
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
export { interceptAxios, interceptNetwork, interceptConsole, interceptZustandStore, interceptWebSocket } from './interceptors';

// Re-export transport types for custom transport implementations
export type { ITransport, TransportConfig } from './transports';
export { LogcatTransport, shouldUseSocket, SOCKET_MESSAGE_TYPES, LOGCAT_MESSAGE_TYPES } from './transports';
