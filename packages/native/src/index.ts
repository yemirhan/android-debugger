import {
  AndroidDebugger,
  type AndroidDebuggerOptions,
  type Command,
  type CommandResponse,
  type CommandHandler as CommandHandlerType,
} from '@yemirhan/android-debugger-sdk';
import { SocketTransport } from './SocketTransport';
import { commandHandler } from './CommandHandler';
import { NativeDebugServer, nativeDebugServer } from './NativeDebugServer';

export interface NativeTransportOptions extends AndroidDebuggerOptions {
  /** Port for the native socket server (default: 8765) */
  port?: number;
}

/**
 * Initialize the Android Debugger SDK with native socket transport.
 *
 * This function:
 * 1. Initializes the base SDK
 * 2. Starts the native TCP server
 * 3. Injects the socket transport for high-performance message delivery
 * 4. Sets up command handling for bi-directional communication
 *
 * @example
 * import { initWithNativeTransport, AndroidDebugger } from '@yemirhan/android-debugger-native';
 *
 * initWithNativeTransport({
 *   port: 8765,
 *   interceptConsole: true,
 *   interceptNetwork: true,
 * });
 *
 * // Register custom command handlers
 * AndroidDebugger.registerCommand('my_command', async (payload) => {
 *   return { result: 'success' };
 * });
 */
export async function initWithNativeTransport(
  options: NativeTransportOptions = {}
): Promise<void> {
  const { port = 8765, ...sdkOptions } = options;

  // First, initialize the base SDK
  AndroidDebugger.init(sdkOptions);

  // Check if native module is available
  if (!NativeDebugServer.isAvailable()) {
    console.warn(
      '[AndroidDebuggerNative] Native module not available - using logcat transport only'
    );
    return;
  }

  try {
    // Create and initialize the socket transport
    const socketTransport = new SocketTransport(port);
    await socketTransport.initialize();

    // Inject the socket transport into the SDK
    AndroidDebugger.setSocketTransport(socketTransport);

    // Initialize command handler for bi-directional communication
    commandHandler.initialize();

    console.log(
      `[AndroidDebuggerNative] Initialized with native transport on port ${port}`
    );
  } catch (error) {
    console.error(
      '[AndroidDebuggerNative] Failed to initialize native transport:',
      error
    );
    console.log('[AndroidDebuggerNative] Falling back to logcat transport only');
  }
}

/**
 * Check if the native transport is available.
 */
export function isNativeTransportAvailable(): boolean {
  return NativeDebugServer.isAvailable();
}

/**
 * Get the current native transport status.
 */
export function getNativeTransportStatus(): {
  available: boolean;
  running: boolean;
  connected: boolean;
  port: number;
} {
  if (!NativeDebugServer.isAvailable()) {
    return {
      available: false,
      running: false,
      connected: false,
      port: 0,
    };
  }

  const status = nativeDebugServer.getStatus();
  return {
    available: true,
    running: status.isRunning,
    connected: status.isClientConnected,
    port: status.port,
  };
}

// Re-export everything from the SDK
export {
  AndroidDebugger,
  DebuggerClient,
  interceptAxios,
  interceptNetwork,
  interceptConsole,
  interceptZustandStore,
  interceptWebSocket,
  LogcatTransport,
  shouldUseSocket,
  SOCKET_MESSAGE_TYPES,
  LOGCAT_MESSAGE_TYPES,
} from '@yemirhan/android-debugger-sdk';

// Re-export types from SDK
export type {
  AndroidDebuggerOptions,
  ITransport,
  TransportConfig,
  Command,
  CommandResponse,
  CommandHandler as CommandHandlerType,
} from '@yemirhan/android-debugger-sdk';

// Export native-specific types and classes
export { SocketTransport } from './SocketTransport';
export { NativeDebugServer, nativeDebugServer } from './NativeDebugServer';
export { CommandHandler, commandHandler } from './CommandHandler';
