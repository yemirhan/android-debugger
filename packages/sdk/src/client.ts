import type { SdkMessage, SdkMessageType } from '@android-debugger/shared';
import { DEFAULT_WS_PORT } from '@android-debugger/shared';

export interface ClientOptions {
  host: string;
  port?: number;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

type MessageHandler = (message: SdkMessage) => void;

export class DebuggerClient {
  private ws: WebSocket | null = null;
  private options: Required<ClientOptions>;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: SdkMessage[] = [];
  private isConnected = false;
  private messageHandlers: Map<SdkMessageType, MessageHandler[]> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: ClientOptions) {
    this.options = {
      host: options.host,
      port: options.port ?? DEFAULT_WS_PORT,
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      onConnect: options.onConnect ?? (() => {}),
      onDisconnect: options.onDisconnect ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
  }

  connect(): void {
    if (this.ws) {
      return;
    }

    const url = `ws://${this.options.host}:${this.options.port}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.options.onConnect();
        this.flushMessageQueue();
        this.startPing();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        this.stopPing();
        this.options.onDisconnect();

        if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (event) => {
        this.options.onError(new Error('WebSocket error'));
      };

      this.ws.onmessage = (event) => {
        try {
          const message: SdkMessage = JSON.parse(event.data as string);
          this.handleMessage(message);
        } catch (error) {
          console.error('[AndroidDebugger] Failed to parse message:', error);
        }
      };
    } catch (error) {
      this.options.onError(error as Error);
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  disconnect(): void {
    this.options.autoReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  send(message: SdkMessage): void {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message to send when connected
      this.messageQueue.push(message);
    }
  }

  on(type: SdkMessageType, handler: MessageHandler): () => void {
    const handlers = this.messageHandlers.get(type) || [];
    handlers.push(handler);
    this.messageHandlers.set(type, handlers);

    return () => {
      const current = this.messageHandlers.get(type) || [];
      this.messageHandlers.set(
        type,
        current.filter((h) => h !== handler)
      );
    };
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  private handleMessage(message: SdkMessage): void {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected && this.ws) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    console.log(
      `[AndroidDebugger] Reconnecting in ${this.options.reconnectInterval}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.options.reconnectInterval);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({
        type: 'ping',
        timestamp: Date.now(),
        payload: null,
      });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
