import type { SdkMessage } from '@android-debugger/shared';

export interface Transport {
  /** Queues or sends a message. Never throws. */
  send(message: SdkMessage): void;
  /** True while the desktop app is confirmed to be receiving messages. */
  isConnected(): boolean;
  onConnectionChange(listener: (connected: boolean) => void): () => void;
  destroy(): void;
}
