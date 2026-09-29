import { execFile } from 'child_process';
import { EventEmitter } from 'events';
import {
  SDK_BRIDGE_DEVICE_PORT,
  SDK_BRIDGE_PROTOCOL_VERSION,
  type SdkBridgeStatus,
  type SdkMessage,
} from '@android-debugger/shared';
import { Batcher } from './logcat-format';
import { SdkBridgeServer, reverseListMapsPort } from './sdk-bridge-server';

const ADB_TIMEOUT_MS = 5000;
// While no app is connected, re-apply the reverse this often: it's lost when
// the device reconnects or the adb server restarts.
const REVERSE_REFRESH_MS = 5000;

const IDLE_STATUS: SdkBridgeStatus = { deviceId: null, state: 'idle', clients: [] };

function runAdb(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { timeout: ADB_TIMEOUT_MS, encoding: 'utf-8' }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolve(stdout);
    });
  });
}

/**
 * Receives SDK messages over WebSocket instead of logcat, so nothing the SDK
 * sends ends up in the app's logs.
 *
 * Each attachment gets its own server on an ephemeral port, and the device's
 * fixed SDK port is reversed to it: every connection on that server comes
 * from the attached device, and a stale reverse left on another device points
 * at a closed port instead of leaking its messages into this session.
 *
 * Emits `messages` (SdkMessage[], batched) and `status` (SdkBridgeStatus).
 */
export class SdkBridge extends EventEmitter {
  private server: SdkBridgeServer | null = null;
  private status: SdkBridgeStatus = IDLE_STATUS;
  private generation = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private batcher: Batcher<SdkMessage> | null = null;

  getStatus(): SdkBridgeStatus {
    return this.status;
  }

  /** Starts listening for SDK connections from `deviceId`. No-op if already attached to it. */
  async attach(deviceId: string): Promise<void> {
    if (!/^[A-Za-z0-9._:-]+$/.test(deviceId)) throw new Error('Invalid Android device ID');
    if (this.status.deviceId === deviceId && (this.server || this.status.state === 'starting')) return;

    await this.detach();
    const generation = ++this.generation;
    this.setStatus({ deviceId, state: 'starting', clients: [] });

    // One IPC message per ~50ms, like the logcat SDK stream.
    const batcher = new Batcher<SdkMessage>((messages) => {
      if (this.batcher === batcher) this.emit('messages', messages);
    }, 50);

    let server: SdkBridgeServer;
    try {
      server = await SdkBridgeServer.listen({
        protocolVersion: SDK_BRIDGE_PROTOCOL_VERSION,
        onMessages: (messages) => {
          for (const message of messages) batcher.push(message);
        },
        onClientsChanged: (clients) => {
          if (generation === this.generation) this.setStatus({ ...this.status, clients });
        },
      });
    } catch (error) {
      batcher.dispose();
      if (generation === this.generation) this.setStatus({ deviceId, state: 'error', error: errorMessage(error), clients: [] });
      return;
    }
    if (generation !== this.generation) {
      batcher.dispose();
      void server.close();
      return;
    }

    this.server = server;
    this.batcher = batcher;
    await this.applyReverse(generation, deviceId, server);
    this.refreshTimer = setInterval(() => {
      if (server.clients.length === 0) void this.applyReverse(generation, deviceId, server);
    }, REVERSE_REFRESH_MS);
  }

  /** Stops listening, disconnects apps and removes the device's reverse if it's still ours. */
  async detach(): Promise<void> {
    this.generation++;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    // Like the logcat SDK stream: nothing from the old session after a switch.
    this.batcher?.dispose();
    this.batcher = null;

    const server = this.server;
    const deviceId = this.status.deviceId;
    this.server = null;
    if (this.status !== IDLE_STATUS) this.setStatus(IDLE_STATUS);
    if (!server) return;

    const hostPort = server.port;
    await server.close();
    if (!deviceId) return;
    try {
      // Another Android Debugger window may have taken the port over since.
      const list = await runAdb(['-s', deviceId, 'reverse', '--list']);
      if (reverseListMapsPort(list, SDK_BRIDGE_DEVICE_PORT, hostPort)) {
        await runAdb(['-s', deviceId, 'reverse', '--remove', `tcp:${SDK_BRIDGE_DEVICE_PORT}`]);
      }
    } catch {
      // Device gone; its reverses went with it.
    }
  }

  private async applyReverse(generation: number, deviceId: string, server: SdkBridgeServer): Promise<void> {
    try {
      await runAdb(['-s', deviceId, 'reverse', `tcp:${SDK_BRIDGE_DEVICE_PORT}`, `tcp:${server.port}`]);
      if (generation === this.generation && this.status.state !== 'listening') {
        this.setStatus({ deviceId, state: 'listening', clients: server.clients });
      }
    } catch (error) {
      if (generation === this.generation) {
        this.setStatus({
          deviceId,
          state: 'error',
          error: `adb reverse failed: ${errorMessage(error)}`,
          clients: server.clients,
        });
      }
    }
  }

  private setStatus(status: SdkBridgeStatus): void {
    this.status = status;
    this.emit('status', status);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
