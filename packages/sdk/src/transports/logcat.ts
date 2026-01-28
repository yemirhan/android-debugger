import type { SdkMessage, SdkMessageType } from '@android-debugger/shared';
import { Buffer } from 'buffer';

const MAX_CHUNK_SIZE = 3500; // Safe limit for logcat line length
const COMPRESSION_THRESHOLD = 1500; // Compress payloads larger than this

// Simple base64 encoding for binary data
function base64Encode(str: string): string {
  try {
    return Buffer.from(str, 'utf-8').toString('base64');
  } catch {
    // Fallback for React Native environment
    // Convert UTF-8 string to base64 without deprecated unescape
    const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(utf8Bytes);
  }
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

export class LogcatTransport {
  private sequenceNumber = 0;
  private readonly prefix = 'SDKMSG';

  send(message: SdkMessage): void {
    const chunks = this.chunkMessage(message);
    for (const chunk of chunks) {
      const logEntry = this.formatLogEntry(message.type, chunk);
      // React Native console.log appears in logcat under ReactNativeJS tag
      console.log(logEntry);
    }
  }

  private chunkMessage(message: SdkMessage): ChunkInfo[] {
    const jsonStr = JSON.stringify(message);
    const shouldCompress = jsonStr.length > COMPRESSION_THRESHOLD;

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

  private formatLogEntry(type: SdkMessageType, chunk: ChunkInfo): string {
    const seq = String(++this.sequenceNumber).padStart(6, '0');
    const compressFlag = chunk.compressed ? 'Z' : '-';
    // Format: SDKMSG:000001:NETWORK:Z:1/3 {...data...}
    return `${this.prefix}:${seq}:${type.toUpperCase()}:${compressFlag}:${chunk.index}/${chunk.total} ${chunk.data}`;
  }
}
