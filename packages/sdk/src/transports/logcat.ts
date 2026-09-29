import type { SdkMessage, SdkMessageType } from '@android-debugger/shared';
import { safeStringify, sdkNotice } from '../serialize';
import type { Transport } from './types';

const MAX_CHUNK_SIZE = 3500; // Safe limit for logcat line length
const COMPRESSION_THRESHOLD = 1500; // Compress payloads larger than this
// Must not exceed the desktop parser's MAX_CHUNKS, which rejects larger messages.
const MAX_CHUNKS = 256;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// UTF-8 -> base64 without relying on Node's Buffer (not available in React Native)
// or btoa (missing on older Hermes versions). Lone surrogates become U+FFFD,
// matching Buffer.from(str, 'utf-8') on the desktop side.
function base64Encode(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }

  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out.push(
      BASE64_ALPHABET[b0 >> 2] +
        BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)] +
        (i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=') +
        (i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 0x3f] : '=')
    );
  }
  return out.join('');
}

// Simple gzip-like compression using run-length encoding for repeated characters
// This is a simplified compression - in production, you might use pako or similar
function simpleCompress(str: string): string {
  // For now, just base64 encode without compression
  // Real compression would use pako/zlib but adds dependency
  return base64Encode(str);
}

interface ChunkInfo {
  index: number;
  total: number;
  data: string;
  compressed: boolean;
}

// Store reference to the ORIGINAL console.log before any interception
// This is captured at module load time, before interceptors are set up
const originalConsoleLog = console.log.bind(console);

/**
 * Legacy transport (SDK 1.x): writes messages to logcat through console.log,
 * where the desktop app picks them up. They also show up in Metro, React
 * Native DevTools and `adb logcat`, which is why WebSocketTransport is the
 * default. Only useful when `adb reverse` isn't available.
 */
export class LogcatTransport implements Transport {
  private sequenceNumber = 0;
  private readonly prefix = 'SDKMSG';
  private readonly sourceId = Math.random().toString(36).slice(2, 10).padEnd(8, '0');

  send(message: SdkMessage): void {
    // Never let a serialization/logging failure escape into host app code
    // (this runs inside console, fetch, XHR, zustand and redux hooks).
    try {
      const jsonStr = safeStringify(message);
      let chunks = this.chunkMessage(jsonStr);

      if (!chunks) {
        // Too large for the desktop parser to reassemble; send a small notice instead.
        const notice = sdkNotice('warn', `Dropped ${message.type} message: payload too large (${jsonStr.length} characters)`);
        chunks = this.chunkMessage(safeStringify(notice));
        if (!chunks) return;
        message = notice;
      }

      // Get a single sequence number for ALL chunks of this message
      this.sequenceNumber = (this.sequenceNumber + 1) % 1_000_000;
      const seq = String(this.sequenceNumber).padStart(6, '0');

      for (const chunk of chunks) {
        const logEntry = this.formatLogEntry(message.type, chunk, seq);
        // Use the ORIGINAL console.log to avoid infinite loop with console interceptor
        // React Native console.log appears in logcat under ReactNativeJS tag
        originalConsoleLog(logEntry);
      }
    } catch {
      // Ignore - debugging must never break the host app
    }
  }

  isConnected(): boolean {
    // Logcat is fire-and-forget; there's no way to know whether anyone reads it.
    return false;
  }

  onConnectionChange(): () => void {
    return () => {};
  }

  destroy(): void {}

  private chunkMessage(jsonStr: string): ChunkInfo[] | null {
    // Even uncompressed, this would need more chunks than the desktop accepts.
    if (jsonStr.length > MAX_CHUNKS * MAX_CHUNK_SIZE) {
      return null;
    }

    // Non-ASCII payloads are always base64 encoded: logcat limits lines by bytes
    // (multi-byte characters could push a line past the limit), and a byte stream
    // decoded in pieces can split multi-byte characters.
    const shouldCompress = jsonStr.length > COMPRESSION_THRESHOLD || /[^\x20-\x7e]/.test(jsonStr);

    let data: string;
    if (shouldCompress) {
      data = simpleCompress(jsonStr);
    } else {
      data = jsonStr;
    }

    // If data fits in single chunk, return it
    if (data.length <= MAX_CHUNK_SIZE) {
      return [{
        index: 1,
        total: 1,
        data,
        compressed: shouldCompress,
      }];
    }

    // Split into chunks
    const chunks: ChunkInfo[] = [];
    const totalChunks = Math.ceil(data.length / MAX_CHUNK_SIZE);
    if (totalChunks > MAX_CHUNKS) {
      return null;
    }

    for (let i = 0; i < totalChunks; i++) {
      const start = i * MAX_CHUNK_SIZE;
      const end = Math.min(start + MAX_CHUNK_SIZE, data.length);
      chunks.push({
        index: i + 1,
        total: totalChunks,
        data: data.slice(start, end),
        compressed: shouldCompress,
      });
    }

    return chunks;
  }

  private formatLogEntry(type: SdkMessageType, chunk: ChunkInfo, seq: string): string {
    const compressFlag = chunk.compressed ? 'Z' : '-';
    // The per-runtime source ID prevents chunk collisions after app reloads or
    // while multiple instrumented processes write to the same log buffer.
    return `${this.prefix}:${this.sourceId}:${seq}:${type.toUpperCase()}:${compressFlag}:${chunk.index}/${chunk.total} ${chunk.data}`;
  }
}
