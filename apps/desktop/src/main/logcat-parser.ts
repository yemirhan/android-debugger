import type { SdkMessage, SdkMessageType } from '@android-debugger/shared';

interface PendingMessage {
  type: SdkMessageType;
  chunks: Map<number, string>;
  total: number;
  compressed: boolean;
  timestamp: number;
}

/**
 * Parses SDK messages from logcat output.
 *
 * SDK messages are formatted as:
 * SDKMSG:000001:NETWORK:Z:1/3 {...data...}
 *
 * Where:
 * - 000001 = sequence number
 * - NETWORK = message type
 * - Z = compressed (- = not compressed)
 * - 1/3 = chunk index / total chunks
 * - {...data...} = JSON payload (or base64 if compressed)
 */
export class LogcatMessageParser {
  private pendingMessages: Map<string, PendingMessage> = new Map();
  private readonly SDK_PREFIX = 'SDKMSG:';
  // Pattern: SDKMSG:000001:NETWORK:Z:1/3 {...data...}
  private readonly MESSAGE_PATTERN = /SDKMSG:(\d{6}):(\w+):([Z-]):(\d+)\/(\d+)\s+(.+)$/;

  // Cleanup old pending messages after 30 seconds
  private readonly MESSAGE_TIMEOUT = 30000;

  parseLogLine(line: string): SdkMessage | null {
    // Quick check for SDK prefix
    if (!line.includes(this.SDK_PREFIX)) {
      return null;
    }

    // Debug: log that we found an SDK message
    console.log('[LogcatParser] Found SDK prefix in line:', line.substring(0, 100));

    const match = line.match(this.MESSAGE_PATTERN);
    if (!match) {
      console.log('[LogcatParser] Regex did not match. Line:', line);
      return null;
    }

    console.log('[LogcatParser] Regex matched, parsing message');

    const [, seq, typeStr, compressedFlag, indexStr, totalStr, payload] = match;
    const sequenceId = seq;
    const type = typeStr.toLowerCase() as SdkMessageType;
    const compressed = compressedFlag === 'Z';
    const index = parseInt(indexStr, 10);
    const total = parseInt(totalStr, 10);

    // Single chunk message - return immediately
    if (total === 1) {
      return this.parsePayload(payload, compressed);
    }

    // Multi-chunk message - buffer and reassemble
    return this.handleChunk(sequenceId, type, compressed, index, total, payload);
  }

  private handleChunk(
    sequenceId: string,
    type: SdkMessageType,
    compressed: boolean,
    index: number,
    total: number,
    payload: string
  ): SdkMessage | null {
    // Create a unique key for this message based on sequence
    // We use sequence ID to group chunks together
    const messageKey = `${sequenceId}-${total}`;

    let pending = this.pendingMessages.get(messageKey);

    if (!pending) {
      pending = {
        type,
        chunks: new Map(),
        total,
        compressed,
        timestamp: Date.now(),
      };
      this.pendingMessages.set(messageKey, pending);
    }

    // Store this chunk
    pending.chunks.set(index, payload);

    // Check if we have all chunks
    if (pending.chunks.size === total) {
      // Reassemble in order
      let fullPayload = '';
      for (let i = 1; i <= total; i++) {
        const chunk = pending.chunks.get(i);
        if (chunk) {
          fullPayload += chunk;
        }
      }

      // Cleanup
      this.pendingMessages.delete(messageKey);

      return this.parsePayload(fullPayload, compressed);
    }

    // Cleanup old pending messages periodically
    this.cleanupOldMessages();

    return null;
  }

  private parsePayload(payload: string, compressed: boolean): SdkMessage | null {
    try {
      let jsonStr: string;

      if (compressed) {
        // Decode base64
        jsonStr = this.base64Decode(payload);
      } else {
        jsonStr = payload;
      }

      return JSON.parse(jsonStr) as SdkMessage;
    } catch (error) {
      console.error('[LogcatParser] Failed to parse SDK message:', error);
      return null;
    }
  }

  private base64Decode(str: string): string {
    try {
      return Buffer.from(str, 'base64').toString('utf-8');
    } catch {
      // Fallback
      return decodeURIComponent(escape(atob(str)));
    }
  }

  private cleanupOldMessages(): void {
    const now = Date.now();
    for (const [key, pending] of this.pendingMessages.entries()) {
      if (now - pending.timestamp > this.MESSAGE_TIMEOUT) {
        console.warn(`[LogcatParser] Discarding incomplete message ${key} (timeout)`);
        this.pendingMessages.delete(key);
      }
    }
  }

  /**
   * Clear all pending messages
   */
  reset(): void {
    this.pendingMessages.clear();
  }
}
