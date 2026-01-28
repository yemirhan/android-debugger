import type { SdkMessage, WebSocketConnection, WebSocketMessage, WebSocketEvent } from '@android-debugger/shared';

type SendFn = (message: SdkMessage) => void;

let originalWebSocket: typeof WebSocket | null = null;
let connectionId = 0;
let messageId = 0;

function generateConnectionId(): string {
  return `ws-${Date.now()}-${++connectionId}`;
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${++messageId}`;
}

/**
 * Intercept WebSocket connections to track connections and messages
 *
 * This will intercept all WebSocket connections created after calling this function.
 * Call the returned function to restore the original WebSocket class.
 *
 * @example
 * import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
 *
 * // Initialize SDK with WebSocket interception
 * AndroidDebugger.init({ interceptWebSocket: true });
 *
 * // Now all WebSocket connections will be tracked
 * const ws = new WebSocket('wss://example.com/socket');
 */
export function interceptWebSocket(send: SendFn): () => void {
  if (originalWebSocket) {
    // Already intercepted
    return () => {};
  }

  originalWebSocket = globalThis.WebSocket;

  // Create intercepted WebSocket class
  const InterceptedWebSocket = class extends originalWebSocket {
    private __debugger_id: string;
    private __debugger_openedAt?: number;

    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);

      this.__debugger_id = generateConnectionId();

      // Send connection created event
      const connection: WebSocketConnection = {
        id: this.__debugger_id,
        url: url.toString(),
        protocol: Array.isArray(protocols) ? protocols[0] : protocols,
        readyState: this.readyState as 0 | 1 | 2 | 3,
      };

      // Listen for open event
      this.addEventListener('open', () => {
        this.__debugger_openedAt = Date.now();

        const event: WebSocketEvent = {
          connectionId: this.__debugger_id,
          event: 'open',
          timestamp: Date.now(),
        };

        send({
          type: 'websocket',
          timestamp: Date.now(),
          payload: {
            type: 'event',
            connection: {
              ...connection,
              readyState: this.readyState,
              openedAt: this.__debugger_openedAt,
            },
            event,
          },
        });
      });

      // Listen for message event
      this.addEventListener('message', (e) => {
        const data = typeof e.data === 'string' ? e.data : '[Binary data]';
        let size = 0;
        if (typeof e.data === 'string') {
          size = e.data.length;
        } else if (e.data instanceof ArrayBuffer) {
          size = e.data.byteLength;
        } else if (e.data instanceof Blob) {
          size = e.data.size;
        }

        const message: WebSocketMessage = {
          id: generateMessageId(),
          connectionId: this.__debugger_id,
          direction: 'received',
          type: typeof e.data === 'string' ? 'text' : 'binary',
          data: typeof e.data === 'string' && data.length > 10000 ? data.substring(0, 10000) + '... [truncated]' : data,
          size,
          timestamp: Date.now(),
        };

        const event: WebSocketEvent = {
          connectionId: this.__debugger_id,
          event: 'message',
          timestamp: Date.now(),
          data: message,
        };

        send({
          type: 'websocket',
          timestamp: Date.now(),
          payload: {
            type: 'message',
            message,
            event,
          },
        });
      });

      // Listen for close event
      this.addEventListener('close', (e) => {
        const event: WebSocketEvent = {
          connectionId: this.__debugger_id,
          event: 'close',
          timestamp: Date.now(),
        };

        send({
          type: 'websocket',
          timestamp: Date.now(),
          payload: {
            type: 'event',
            connection: {
              ...connection,
              readyState: this.readyState,
              openedAt: this.__debugger_openedAt,
              closedAt: Date.now(),
            },
            event,
            closeCode: e.code,
            closeReason: e.reason,
          },
        });
      });

      // Listen for error event
      this.addEventListener('error', () => {
        const event: WebSocketEvent = {
          connectionId: this.__debugger_id,
          event: 'error',
          timestamp: Date.now(),
          error: 'WebSocket error occurred',
        };

        send({
          type: 'websocket',
          timestamp: Date.now(),
          payload: {
            type: 'event',
            connection: {
              ...connection,
              readyState: this.readyState,
            },
            event,
          },
        });
      });

      // Initial connection event
      send({
        type: 'websocket',
        timestamp: Date.now(),
        payload: {
          type: 'connection',
          connection,
        },
      });
    }

    // Override send method
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      const dataStr = typeof data === 'string' ? data : '[Binary data]';
      let size = 0;
      if (typeof data === 'string') {
        size = data.length;
      } else if (data instanceof ArrayBuffer) {
        size = data.byteLength;
      } else if (data instanceof Blob) {
        size = data.size;
      } else if (ArrayBuffer.isView(data)) {
        size = data.byteLength;
      }

      const message: WebSocketMessage = {
        id: generateMessageId(),
        connectionId: this.__debugger_id,
        direction: 'sent',
        type: typeof data === 'string' ? 'text' : 'binary',
        data: typeof data === 'string' && dataStr.length > 10000 ? dataStr.substring(0, 10000) + '... [truncated]' : dataStr,
        size,
        timestamp: Date.now(),
      };

      send({
        type: 'websocket',
        timestamp: Date.now(),
        payload: {
          type: 'message',
          message,
        },
      });

      super.send(data);
    }
  };

  // Replace global WebSocket
  (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = InterceptedWebSocket as unknown as typeof WebSocket;

  // Return restore function
  return () => {
    if (originalWebSocket) {
      (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
      originalWebSocket = null;
    }
  };
}
