import { AndroidDebugger, type Command, type CommandResponse } from '@yemirhan/android-debugger-sdk';
import { nativeDebugServer, NativeDebugServer, type Subscription } from './NativeDebugServer';

/**
 * CommandHandler manages bi-directional command communication between
 * the desktop app and the mobile app via the native socket transport.
 *
 * Commands flow: Desktop -> Socket -> Native Module -> JS (CommandHandler) -> SDK
 * Responses flow: SDK -> CommandHandler -> Native Module -> Socket -> Desktop
 */
export class CommandHandler {
  private static instance: CommandHandler | null = null;
  private subscription: Subscription | null = null;
  private initialized = false;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): CommandHandler {
    if (!CommandHandler.instance) {
      CommandHandler.instance = new CommandHandler();
    }
    return CommandHandler.instance;
  }

  /**
   * Initialize the command handler.
   * Sets up listeners for incoming messages from the native module.
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    if (!NativeDebugServer.isAvailable()) {
      console.warn('[CommandHandler] Native module not available');
      return;
    }

    // Listen for incoming messages
    this.subscription = nativeDebugServer.addMessageReceivedListener(async (event) => {
      try {
        const data = JSON.parse(event.message);

        // Check if this is a command (has id and type fields)
        if (this.isCommand(data)) {
          await this.handleCommand(data as Command);
        }
      } catch (error) {
        console.error('[CommandHandler] Error processing message:', error);
      }
    });

    this.initialized = true;
    console.log('[CommandHandler] Initialized');
  }

  /**
   * Check if a message is a command.
   */
  private isCommand(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      typeof obj.type === 'string' &&
      obj.type !== 'response'
    );
  }

  /**
   * Handle an incoming command from the desktop app.
   */
  private async handleCommand(command: Command): Promise<void> {
    console.log('[CommandHandler] Received command:', command.type);

    try {
      // Use the SDK's command handling system
      const response = await AndroidDebugger.handleCommand(command);

      // Send the response back to the desktop
      await this.sendResponse(response);
    } catch (error) {
      // Send error response
      const errorResponse: CommandResponse = {
        id: command.id,
        type: 'response',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      await this.sendResponse(errorResponse);
    }
  }

  /**
   * Send a response back to the desktop app.
   */
  private async sendResponse(response: CommandResponse): Promise<void> {
    try {
      const json = JSON.stringify(response);
      await nativeDebugServer.sendMessage(json);
    } catch (error) {
      console.error('[CommandHandler] Error sending response:', error);
    }
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.initialized = false;
  }
}

// Export singleton instance
export const commandHandler = CommandHandler.getInstance();
