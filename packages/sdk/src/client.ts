import type { SdkMessage } from '@android-debugger/shared';
import { LogcatTransport } from './transports';

/**
 * DebuggerClient sends SDK messages via logcat transport.
 * Messages are logged to console with a specific prefix that the desktop app
 * parses from the ADB logcat stream.
 */
export class DebuggerClient {
  private transport: LogcatTransport;

  constructor() {
    this.transport = new LogcatTransport();
  }

  /**
   * Send a message to the desktop app via logcat
   */
  send(message: SdkMessage): void {
    this.transport.send(message);
  }
}
