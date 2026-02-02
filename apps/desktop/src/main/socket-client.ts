import * as net from 'net';
import { EventEmitter } from 'events';

export interface SocketClientOptions {
  host: string;
  port: number;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

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

type PendingCommand = {
  resolve: (response: CommandResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

/**
 * TCP client for communicating with the Android app's native debug server.
 * Uses length-prefixed JSON messages for bi-directional communication.
 *
 * Protocol:
 * - Each message is a JSON string
 * - Messages are length-prefixed: 4-byte big-endian length + payload
 */
export class SocketClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private connecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  private readBuffer = Buffer.alloc(0);
  private pendingCommands = new Map<string, PendingCommand>();
  private commandIdCounter = 0;

  private readonly options: Required<SocketClientOptions>;

  constructor(options: SocketClientOptions) {
    super();
    this.options = {
      host: options.host,
      port: options.port,
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 2000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    };
  }

  /**
   * Connect to the debug server.
   */
  async connect(): Promise<boolean> {
    if (this.connected || this.connecting) {
      return this.connected;
    }

    this.connecting = true;

    return new Promise((resolve) => {
      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        console.log(`[SocketClient] Connected to ${this.options.host}:${this.options.port}`);
        this.emit('connected');
        resolve(true);
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('error', (error: Error) => {
        console.error('[SocketClient] Socket error:', error.message);
        this.emit('error', error);
      });

      this.socket.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        this.socket = null;

        if (wasConnected) {
          console.log('[SocketClient] Disconnected');
          this.emit('disconnected');
        }

        // Reject all pending commands
        this.rejectPendingCommands('Connection closed');

        // Attempt reconnection
        if (this.options.reconnect) {
          this.scheduleReconnect();
        }

        if (!wasConnected && this.connecting) {
          resolve(false);
        }
      });

      this.socket.connect({
        host: this.options.host,
        port: this.options.port,
      });

      // Set connection timeout
      this.socket.setTimeout(5000, () => {
        if (!this.connected) {
          this.socket?.destroy();
          this.connecting = false;
          resolve(false);
        }
      });
    });
  }

  /**
   * Disconnect from the debug server.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;
    this.rejectPendingCommands('Client disconnected');
  }

  /**
   * Check if connected to the server.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send a message to the debug server.
   */
  send(message: unknown): boolean {
    if (!this.connected || !this.socket) {
      return false;
    }

    try {
      const json = JSON.stringify(message);
      const payload = Buffer.from(json, 'utf-8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(payload.length, 0);

      this.socket.write(Buffer.concat([lengthBuffer, payload]));
      return true;
    } catch (error) {
      console.error('[SocketClient] Error sending message:', error);
      return false;
    }
  }

  /**
   * Send a command and wait for a response.
   * @param type The command type
   * @param payload Optional command payload
   * @param timeout Timeout in milliseconds (default: 10000)
   */
  sendCommand(
    type: string,
    payload?: unknown,
    timeout: number = 10000
  ): Promise<CommandResponse> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected'));
        return;
      }

      const id = `cmd-${++this.commandIdCounter}-${Date.now()}`;
      const command: Command = { id, type, payload };

      // Set up timeout
      const timeoutTimer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command timed out: ${type}`));
      }, timeout);

      // Store pending command
      this.pendingCommands.set(id, {
        resolve,
        reject,
        timeout: timeoutTimer,
      });

      // Send the command
      if (!this.send(command)) {
        this.pendingCommands.delete(id);
        clearTimeout(timeoutTimer);
        reject(new Error('Failed to send command'));
      }
    });
  }

  /**
   * Send a ping command to check connection health.
   */
  async ping(): Promise<number> {
    const start = Date.now();
    await this.sendCommand('ping');
    return Date.now() - start;
  }

  private handleData(data: Buffer): void {
    // Append to read buffer
    this.readBuffer = Buffer.concat([this.readBuffer, data]);

    // Process complete messages
    while (this.readBuffer.length >= 4) {
      const messageLength = this.readBuffer.readUInt32BE(0);

      if (this.readBuffer.length < 4 + messageLength) {
        // Not enough data yet
        break;
      }

      // Extract the message
      const messageData = this.readBuffer.subarray(4, 4 + messageLength);
      this.readBuffer = this.readBuffer.subarray(4 + messageLength);

      try {
        const message = JSON.parse(messageData.toString('utf-8'));
        this.handleMessage(message);
      } catch (error) {
        console.error('[SocketClient] Error parsing message:', error);
      }
    }
  }

  private handleMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const msg = message as Record<string, unknown>;

    // Check if this is a response to a pending command
    if (msg.type === 'response' && typeof msg.id === 'string') {
      const pending = this.pendingCommands.get(msg.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(msg.id);
        pending.resolve(msg as unknown as CommandResponse);
        return;
      }
    }

    // Emit the message for other handlers
    this.emit('message', message);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.connected) {
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('[SocketClient] Max reconnect attempts reached');
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `[SocketClient] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.connected) {
        const success = await this.connect();
        if (!success) {
          this.scheduleReconnect();
        }
      }
    }, this.options.reconnectInterval);
  }

  private rejectPendingCommands(reason: string): void {
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingCommands.clear();
  }
}
