import { EventEmitter } from 'events';
import type { SdkMessage } from '@android-debugger/shared';
import { SocketClient, Command, CommandResponse } from './socket-client';
import { AdbService } from './adb';

export type TransportType = 'socket' | 'logcat' | 'none';

export interface TransportStatus {
  type: TransportType;
  connected: boolean;
  port?: number;
  deviceId?: string;
}

/**
 * TransportManager unifies message reception from both socket and logcat transports.
 * It handles:
 * - Automatic port forwarding setup
 * - Socket connection management
 * - Fallback to logcat when socket is unavailable
 * - Bi-directional command communication
 */
export class TransportManager extends EventEmitter {
  private socketClient: SocketClient | null = null;
  private adbService: AdbService;
  private currentDeviceId: string | null = null;
  private currentPackageName: string | null = null;
  private localPort: number = 8765;
  private remotePort: number = 8765;
  private autoConnect: boolean = true;
  private connectionCheckInterval: NodeJS.Timeout | null = null;

  constructor(adbService: AdbService) {
    super();
    this.adbService = adbService;
  }

  /**
   * Configure the transport manager for a specific device and app.
   */
  async configure(
    deviceId: string,
    packageName: string,
    options?: {
      localPort?: number;
      remotePort?: number;
      autoConnect?: boolean;
    }
  ): Promise<void> {
    // Disconnect from previous device
    if (this.currentDeviceId && this.currentDeviceId !== deviceId) {
      await this.disconnect();
    }

    this.currentDeviceId = deviceId;
    this.currentPackageName = packageName;
    this.localPort = options?.localPort ?? 8765;
    this.remotePort = options?.remotePort ?? 8765;
    this.autoConnect = options?.autoConnect ?? true;

    if (this.autoConnect) {
      await this.connect();
    }
  }

  /**
   * Attempt to connect to the app via socket.
   */
  async connect(): Promise<boolean> {
    if (!this.currentDeviceId) {
      console.log('[TransportManager] No device configured');
      return false;
    }

    // Set up ADB port forwarding
    const forwardSuccess = await this.adbService.setupPortForward(
      this.currentDeviceId,
      this.localPort,
      this.remotePort
    );

    if (!forwardSuccess) {
      console.log('[TransportManager] Failed to set up port forwarding');
      return false;
    }

    // Create and connect socket client
    this.socketClient = new SocketClient({
      host: '127.0.0.1',
      port: this.localPort,
      reconnect: true,
      reconnectInterval: 2000,
      maxReconnectAttempts: 5,
    });

    // Set up event handlers
    this.socketClient.on('connected', () => {
      console.log('[TransportManager] Socket connected');
      this.emit('transportChanged', this.getStatus());
    });

    this.socketClient.on('disconnected', () => {
      console.log('[TransportManager] Socket disconnected');
      this.emit('transportChanged', this.getStatus());
    });

    this.socketClient.on('message', (message: unknown) => {
      // If it's an SDK message (has type and payload), emit it
      if (this.isSdkMessage(message)) {
        this.emit('sdkMessage', message);
      }
    });

    this.socketClient.on('error', (error: Error) => {
      console.error('[TransportManager] Socket error:', error.message);
    });

    this.socketClient.on('reconnectFailed', () => {
      console.log('[TransportManager] Socket reconnection failed, falling back to logcat');
      this.emit('transportChanged', this.getStatus());
    });

    // Connect to the app
    const connected = await this.socketClient.connect();

    if (connected) {
      // Start periodic connection check
      this.startConnectionCheck();
    }

    return connected;
  }

  /**
   * Disconnect from the current device.
   */
  async disconnect(): Promise<void> {
    this.stopConnectionCheck();

    if (this.socketClient) {
      this.socketClient.disconnect();
      this.socketClient = null;
    }

    if (this.currentDeviceId) {
      await this.adbService.removePortForward(this.currentDeviceId, this.localPort);
    }

    this.emit('transportChanged', this.getStatus());
  }

  /**
   * Get the current transport status.
   */
  getStatus(): TransportStatus {
    if (this.socketClient?.isConnected()) {
      return {
        type: 'socket',
        connected: true,
        port: this.localPort,
        deviceId: this.currentDeviceId ?? undefined,
      };
    }

    // Fall back to logcat status (always available if device is connected)
    if (this.currentDeviceId) {
      return {
        type: 'logcat',
        connected: true,
        deviceId: this.currentDeviceId,
      };
    }

    return {
      type: 'none',
      connected: false,
    };
  }

  /**
   * Check if socket transport is connected.
   */
  isSocketConnected(): boolean {
    return this.socketClient?.isConnected() ?? false;
  }

  /**
   * Send a command to the app and get a response.
   */
  async sendCommand(command: Omit<Command, 'id'>): Promise<CommandResponse> {
    if (!this.socketClient?.isConnected()) {
      return {
        id: '',
        type: 'response',
        success: false,
        error: 'Socket not connected',
      };
    }

    try {
      return await this.socketClient.sendCommand(command.type, command.payload);
    } catch (error) {
      return {
        id: '',
        type: 'response',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a ping command and return the latency.
   */
  async ping(): Promise<number | null> {
    if (!this.socketClient?.isConnected()) {
      return null;
    }

    try {
      return await this.socketClient.ping();
    } catch {
      return null;
    }
  }

  /**
   * Handle an SDK message received via logcat.
   * This is called by the logcat parser when it detects an SDK message.
   */
  handleLogcatMessage(message: SdkMessage): void {
    // If socket is connected, we're getting messages via socket, so ignore logcat duplicates
    // for message types that are routed to socket
    if (this.socketClient?.isConnected()) {
      const socketTypes = ['network', 'zustand', 'state', 'custom', 'performance', 'websocket'];
      if (socketTypes.includes(message.type)) {
        return; // Skip - we're getting these via socket
      }
    }

    this.emit('sdkMessage', message);
  }

  private isSdkMessage(message: unknown): message is SdkMessage {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const msg = message as Record<string, unknown>;
    return (
      typeof msg.type === 'string' &&
      typeof msg.timestamp === 'number' &&
      'payload' in msg
    );
  }

  private startConnectionCheck(): void {
    this.stopConnectionCheck();

    // Check connection every 30 seconds
    this.connectionCheckInterval = setInterval(async () => {
      if (this.socketClient?.isConnected()) {
        try {
          const latency = await this.socketClient.ping();
          this.emit('ping', latency);
        } catch {
          console.log('[TransportManager] Ping failed');
        }
      }
    }, 30000);
  }

  private stopConnectionCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.disconnect();
    this.removeAllListeners();
  }
}
