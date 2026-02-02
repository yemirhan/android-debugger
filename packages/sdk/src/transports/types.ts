import type { SdkMessage, SdkMessageType } from '@android-debugger/shared';

/**
 * Transport interface for sending SDK messages to the desktop app.
 * Implementations can use different communication channels (logcat, socket, etc.)
 */
export interface ITransport {
  /** Unique name identifying this transport */
  readonly name: string;

  /**
   * Check if the transport is currently connected/ready
   */
  isConnected(): boolean;

  /**
   * Send a message through this transport
   */
  send(message: SdkMessage): void;

  /**
   * Optional: Initialize the transport (e.g., start server, connect)
   */
  initialize?(): Promise<void>;

  /**
   * Optional: Clean up resources
   */
  destroy?(): void;

  /**
   * Optional: Register a callback for connection status changes
   */
  onConnectionChange?(callback: (connected: boolean) => void): () => void;
}

/**
 * Message types that should be routed to socket transport when available.
 * These are typically larger payloads or need low latency.
 */
export const SOCKET_MESSAGE_TYPES: SdkMessageType[] = [
  'network',
  'zustand',
  'state',
  'custom',
  'performance',
  'websocket',
];

/**
 * Message types that should always use logcat transport.
 * Console logs are simple text and don't need socket overhead.
 */
export const LOGCAT_MESSAGE_TYPES: SdkMessageType[] = ['console'];

/**
 * Configuration for transport routing in the debugger client
 */
export interface TransportConfig {
  /** Socket transport for large payloads (network, state) - optional */
  socketTransport?: ITransport;
  /** Logcat transport for simple messages (console) - always available */
  logcatTransport: ITransport;
}

/**
 * Check if a message type should prefer socket transport
 */
export function shouldUseSocket(type: SdkMessageType): boolean {
  return SOCKET_MESSAGE_TYPES.includes(type);
}
