import { WebSocketServer, WebSocket } from 'ws';
import type { SdkMessage } from '@android-debugger/shared';
import { DEFAULT_WS_PORT } from '@android-debugger/shared';
import { v4 as uuidv4 } from 'uuid';

type MessageCallback = (clientId: string, message: SdkMessage) => void;
type ConnectionCallback = (clientId: string, connected: boolean) => void;

interface Client {
  id: string;
  ws: WebSocket;
  connectedAt: number;
}

export class WebSocketService {
  private server: WebSocketServer | null = null;
  private clients: Map<string, Client> = new Map();
  private messageCallback: MessageCallback | null = null;
  private connectionCallback: ConnectionCallback | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  async start(port: number = DEFAULT_WS_PORT): Promise<void> {
    if (this.server) {
      throw new Error('WebSocket server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ host: '0.0.0.0', port });

      this.server.on('listening', () => {
        console.log(`WebSocket server started on 0.0.0.0:${port}`);
        this.startPingInterval();
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('WebSocket server error:', error);
        reject(error);
      });

      this.server.on('connection', (ws: WebSocket) => {
        const clientId = uuidv4();
        const client: Client = {
          id: clientId,
          ws,
          connectedAt: Date.now(),
        };

        this.clients.set(clientId, client);
        console.log(`Client connected: ${clientId}`);

        if (this.connectionCallback) {
          this.connectionCallback(clientId, true);
        }

        ws.on('message', (data: Buffer) => {
          try {
            const message: SdkMessage = JSON.parse(data.toString());

            if (message.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              return;
            }

            if (this.messageCallback) {
              this.messageCallback(clientId, message);
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });

        ws.on('close', () => {
          this.clients.delete(clientId);
          console.log(`Client disconnected: ${clientId}`);

          if (this.connectionCallback) {
            this.connectionCallback(clientId, false);
          }
        });

        ws.on('error', (error) => {
          console.error(`Client ${clientId} error:`, error);
        });

        // Send welcome message
        ws.send(
          JSON.stringify({
            type: 'connected',
            clientId,
            timestamp: Date.now(),
          })
        );
      });
    });
  }

  async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.clients.clear();

      this.server?.close(() => {
        console.log('WebSocket server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const client of this.clients.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }, 30000);
  }

  onMessage(callback: MessageCallback): void {
    this.messageCallback = callback;
  }

  onConnection(callback: ConnectionCallback): void {
    this.connectionCallback = callback;
  }

  getConnectionCount(): number {
    return this.clients.size;
  }

  broadcast(message: SdkMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  send(clientId: string, message: SdkMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}

export const wsService = new WebSocketService();
