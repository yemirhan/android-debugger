import { useSyncExternalStore } from 'react';
import { avcCodecStringFromConfig, mergeConfigAndFrame } from './h264';
import type {
  MirrorControlRequest,
  MirrorPortMessage,
  MirrorPortRequest,
  MirrorQualityPreset,
  MirrorStartOptions,
} from './types';

/**
 * Renderer side of in-app mirroring: owns the session MessagePort, decodes
 * the H.264 stream with WebCodecs and paints frames onto whichever canvas is
 * attached (the Screen Mirror panel, or the pinned floating player).
 *
 * Module-level store read through useSyncExternalStore, so the session can
 * outlive the panel when the user pins it.
 */

export const MIRROR_QUALITY_PRESETS: MirrorQualityPreset[] = [
  { id: 'smooth', label: 'Smooth', description: '720p · 4 Mbps', maxSize: 720, videoBitRate: 4_000_000, maxFps: 60 },
  { id: 'balanced', label: 'Balanced', description: '1280p · 8 Mbps', maxSize: 1280, videoBitRate: 8_000_000, maxFps: 60 },
  { id: 'sharp', label: 'Sharp', description: '1920p · 16 Mbps', maxSize: 1920, videoBitRate: 16_000_000, maxFps: 60 },
  { id: 'native', label: 'Native', description: 'Full resolution · 24 Mbps', maxSize: 0, videoBitRate: 24_000_000, maxFps: 60 },
];

export type MirrorStatus = 'idle' | 'starting' | 'streaming' | 'error';

export interface MirrorStats {
  fps: number;
  bitrateKbps: number;
  /** Time from packet arrival to decoded frame, in ms. */
  decodeMs: number;
  droppedFrames: number;
}

export interface MirrorSnapshot {
  status: MirrorStatus;
  error: string | null;
  errorCode: 'server-missing' | 'failed' | null;
  deviceId: string | null;
  deviceName: string | null;
  videoWidth: number;
  videoHeight: number;
  stats: MirrorStats;
  pinned: boolean;
  screenOff: boolean;
  qualityId: string;
  prefs: MirrorPrefs;
  /** Bumped when device clipboard text lands on the host clipboard. */
  clipboardCopies: number;
}

export interface MirrorPrefs {
  /** Keep the device awake while mirroring (restored afterwards). */
  stayAwake: boolean;
  /** Show touch indicators on the device (restored afterwards). */
  showTouches: boolean;
}

const STORAGE_KEY = 'android-debugger:mirror-settings';
const DEFAULT_PREFS: MirrorPrefs = { stayAwake: true, showTouches: false };

function loadStored(): { qualityId: string; prefs: MirrorPrefs } {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      qualityId?: unknown;
      prefs?: Partial<Record<keyof MirrorPrefs, unknown>>;
    };
    const qualityId =
      typeof stored.qualityId === 'string' && MIRROR_QUALITY_PRESETS.some((preset) => preset.id === stored.qualityId)
        ? stored.qualityId
        : 'balanced';
    const prefs: MirrorPrefs = {
      stayAwake: typeof stored.prefs?.stayAwake === 'boolean' ? stored.prefs.stayAwake : DEFAULT_PREFS.stayAwake,
      showTouches: typeof stored.prefs?.showTouches === 'boolean' ? stored.prefs.showTouches : DEFAULT_PREFS.showTouches,
    };
    return { qualityId, prefs };
  } catch {
    return { qualityId: 'balanced', prefs: DEFAULT_PREFS };
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ qualityId: snapshot.qualityId, prefs: snapshot.prefs }));
  } catch {
    // Storage unavailable.
  }
}

const stored = loadStored();

const EMPTY_STATS: MirrorStats = { fps: 0, bitrateKbps: 0, decodeMs: 0, droppedFrames: 0 };

let snapshot: MirrorSnapshot = {
  status: 'idle',
  error: null,
  errorCode: null,
  deviceId: null,
  deviceName: null,
  videoWidth: 0,
  videoHeight: 0,
  stats: EMPTY_STATS,
  pinned: false,
  screenOff: false,
  qualityId: stored.qualityId,
  prefs: stored.prefs,
  clipboardCopies: 0,
};

const listeners = new Set<() => void>();

function update(patch: Partial<MirrorSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function getMirrorSnapshot(): MirrorSnapshot {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMirror(): MirrorSnapshot {
  return useSyncExternalStore(subscribe, getMirrorSnapshot);
}

// ---------------------------------------------------------------------------
// Port hand-off (the preload forwards each session port with window.postMessage)
// ---------------------------------------------------------------------------

const arrivedPorts = new Map<string, MessagePort>();
const portWaiters = new Map<string, (port: MessagePort) => void>();

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as { source?: unknown; sessionId?: unknown } | null;
  if (!data || data.source !== 'adbg-mirror-port' || typeof data.sessionId !== 'string') return;
  const port = event.ports[0];
  if (!port) return;
  const waiter = portWaiters.get(data.sessionId);
  if (waiter) {
    portWaiters.delete(data.sessionId);
    waiter(port);
  } else {
    arrivedPorts.set(data.sessionId, port);
    // Ports for sessions nobody claims (e.g. a start that was superseded) are
    // closed after a while so they do not pile up.
    setTimeout(() => {
      if (arrivedPorts.get(data.sessionId as string) === port) {
        arrivedPorts.delete(data.sessionId as string);
        port.close();
      }
    }, 30_000);
  }
});

function takePort(sessionId: string, timeoutMs = 5000): Promise<MessagePort> {
  const ready = arrivedPorts.get(sessionId);
  if (ready) {
    arrivedPorts.delete(sessionId);
    return Promise.resolve(ready);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      portWaiters.delete(sessionId);
      reject(new Error('The mirror stream did not arrive'));
    }, timeoutMs);
    portWaiters.set(sessionId, (port) => {
      clearTimeout(timer);
      resolve(port);
    });
  });
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

class MirrorSession {
  readonly sessionId: string;
  private port: MessagePort;
  private decoder: VideoDecoder | null = null;
  private pendingConfig: Uint8Array | null = null;
  private awaitingKeyFrame = true;
  private lastFrame: VideoFrame | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private arrivals = new Map<number, number>();
  private frameCount = 0;
  private byteCount = 0;
  private decodeTotal = 0;
  private decodeSamples = 0;
  private dropped = 0;
  private lastResetRequest = 0;
  private statsTimer: number;
  private disposed = false;
  private sawFrame = false;

  constructor(sessionId: string, port: MessagePort) {
    this.sessionId = sessionId;
    this.port = port;
    port.onmessage = (event: MessageEvent<MirrorPortMessage>) => this.handle(event.data);
    port.start();
    this.statsTimer = window.setInterval(() => this.flushStats(), 1000);
  }

  private handle(message: MirrorPortMessage): void {
    if (this.disposed) return;
    switch (message.type) {
      case 'device-meta':
        update({ deviceName: message.deviceName || null });
        break;
      case 'codec':
        if (message.codec !== 'h264') {
          this.fail(`The device sent an unsupported video codec (${message.codec ?? 'unknown'}).`);
        }
        break;
      case 'session':
        update({ videoWidth: message.width, videoHeight: message.height });
        this.awaitingKeyFrame = true;
        break;
      case 'packet':
        if (message.config) this.configure(message.data);
        else this.decode(message);
        break;
      case 'clipboard':
        update({ clipboardCopies: snapshot.clipboardCopies + 1 });
        break;
      case 'closed':
        this.dispose();
        if (activeSession === this) {
          activeSession = null;
          if (message.error) {
            update({ status: 'error', error: message.error, errorCode: 'failed', screenOff: false });
          } else {
            update({ status: 'idle', error: null, errorCode: null, screenOff: false });
          }
        }
        break;
    }
  }

  private configure(config: Uint8Array): void {
    const codec = avcCodecStringFromConfig(config);
    if (!codec) {
      this.fail('The device sent a video stream without codec parameters.');
      return;
    }
    this.pendingConfig = config;
    this.awaitingKeyFrame = true;
    try {
      if (!this.decoder || this.decoder.state === 'closed') {
        this.decoder = new VideoDecoder({
          output: (frame) => this.onFrame(frame),
          error: (error) => this.onDecoderError(error),
        });
      } else {
        this.decoder.reset();
      }
      // No `description`: the stream is Annex-B with in-band SPS/PPS.
      this.decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: 'no-preference' });
    } catch (error) {
      this.fail(`This computer cannot decode the stream (${codec}): ${error instanceof Error ? error.message : error}`);
    }
  }

  private decode(packet: { keyFrame: boolean; pts: number | null; data: Uint8Array }): void {
    const decoder = this.decoder;
    if (!decoder || decoder.state !== 'configured') return;
    this.byteCount += packet.data.length;
    if (this.awaitingKeyFrame && !packet.keyFrame) {
      this.dropped++;
      return;
    }
    // Falling behind: drop until the next key frame rather than adding latency.
    if (!packet.keyFrame && decoder.decodeQueueSize > 6) {
      this.dropped++;
      this.awaitingKeyFrame = true;
      this.requestKeyFrame();
      return;
    }
    let data = packet.data;
    if (packet.keyFrame && this.pendingConfig) {
      data = mergeConfigAndFrame(this.pendingConfig, data);
      this.pendingConfig = null;
    }
    this.awaitingKeyFrame = false;
    const timestamp = packet.pts ?? 0;
    this.arrivals.set(timestamp, performance.now());
    if (this.arrivals.size > 120) {
      const oldest = this.arrivals.keys().next().value;
      if (oldest !== undefined) this.arrivals.delete(oldest);
    }
    try {
      decoder.decode(new EncodedVideoChunk({ type: packet.keyFrame ? 'key' : 'delta', timestamp, data }));
    } catch {
      this.awaitingKeyFrame = true;
      this.requestKeyFrame();
    }
  }

  private requestKeyFrame(): void {
    const now = performance.now();
    if (now - this.lastResetRequest < 1000) return;
    this.lastResetRequest = now;
    this.send({ type: 'control', request: { type: 'reset-video' } });
  }

  private onDecoderError(error: DOMException): void {
    if (this.disposed) return;
    console.warn('[mirror] decoder error, requesting a new key frame', error);
    // The decoder is closed after an error; the next config packet (sent
    // after a video reset) recreates it.
    this.decoder = null;
    this.awaitingKeyFrame = true;
    this.lastResetRequest = 0;
    this.requestKeyFrame();
  }

  private onFrame(frame: VideoFrame): void {
    if (this.disposed) {
      frame.close();
      return;
    }
    this.frameCount++;
    const arrived = this.arrivals.get(frame.timestamp);
    if (arrived !== undefined) {
      this.arrivals.delete(frame.timestamp);
      this.decodeTotal += performance.now() - arrived;
      this.decodeSamples++;
    }
    this.lastFrame?.close();
    this.lastFrame = frame;
    this.paint();
    if (!this.sawFrame) {
      this.sawFrame = true;
      update({ status: 'streaming', error: null, errorCode: null });
    }
  }

  private paint(): void {
    const frame = this.lastFrame;
    const canvas = this.canvas;
    if (!frame || !canvas) return;
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      this.context = null;
    }
    if (!this.context) this.context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.context?.drawImage(frame, 0, 0, canvas.width, canvas.height);
  }

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.context = null;
    this.paint();
  }

  detachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) {
      this.canvas = null;
      this.context = null;
    }
  }

  private flushStats(): void {
    const stats: MirrorStats = {
      fps: this.frameCount,
      bitrateKbps: Math.round((this.byteCount * 8) / 1000),
      decodeMs: this.decodeSamples > 0 ? this.decodeTotal / this.decodeSamples : 0,
      droppedFrames: this.dropped,
    };
    this.frameCount = 0;
    this.byteCount = 0;
    this.decodeTotal = 0;
    this.decodeSamples = 0;
    const previous = snapshot.stats;
    if (
      previous.fps !== stats.fps ||
      previous.bitrateKbps !== stats.bitrateKbps ||
      Math.round(previous.decodeMs * 10) !== Math.round(stats.decodeMs * 10) ||
      previous.droppedFrames !== stats.droppedFrames
    ) {
      update({ stats });
    }
  }

  send(request: MirrorPortRequest): void {
    if (this.disposed) return;
    this.port.postMessage(request);
  }

  private fail(message: string): void {
    const sessionId = this.sessionId;
    this.dispose();
    if (activeSession === this) {
      activeSession = null;
      update({ status: 'error', error: message, errorCode: 'failed' });
    }
    void window.electronAPI.stopInAppMirror(sessionId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.statsTimer);
    this.port.onmessage = null;
    this.port.close();
    try {
      if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    } catch {
      // Already closed.
    }
    this.decoder = null;
    this.lastFrame?.close();
    this.lastFrame = null;
    this.arrivals.clear();
  }
}

let activeSession: MirrorSession | null = null;
let startGeneration = 0;
const attachedCanvases = new Set<HTMLCanvasElement>();
let primaryCanvas: HTMLCanvasElement | null = null;

export function getQualityPreset(id: string): MirrorQualityPreset {
  return MIRROR_QUALITY_PRESETS.find((preset) => preset.id === id) ?? MIRROR_QUALITY_PRESETS[1];
}

export interface StartMirrorOptions {
  /** Turn the device display off once the stream is up (restored on stop). */
  turnScreenOff?: boolean;
}

export async function startMirror(deviceId: string, extra: StartMirrorOptions = {}): Promise<void> {
  const generation = ++startGeneration;
  await stopActiveSession();
  if (generation !== startGeneration) return;

  const preset = getQualityPreset(snapshot.qualityId);
  const options: MirrorStartOptions = {
    maxSize: preset.maxSize,
    videoBitRate: preset.videoBitRate,
    maxFps: preset.maxFps,
    stayAwake: snapshot.prefs.stayAwake,
    showTouches: snapshot.prefs.showTouches,
    turnScreenOff: extra.turnScreenOff ?? false,
  };
  update({
    status: 'starting',
    error: null,
    errorCode: null,
    deviceId,
    deviceName: null,
    videoWidth: 0,
    videoHeight: 0,
    stats: EMPTY_STATS,
    screenOff: options.turnScreenOff,
  });

  let result;
  try {
    result = await window.electronAPI.startInAppMirror(deviceId, options);
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : 'Failed to start mirroring' };
  }

  if (generation !== startGeneration) {
    // Superseded by a stop or another start while we were connecting.
    if (result.success && result.sessionId) void window.electronAPI.stopInAppMirror(result.sessionId);
    return;
  }
  if (!result.success || !result.sessionId) {
    if (result.sessionId) arrivedPorts.get(result.sessionId)?.close();
    update({
      status: 'error',
      error: result.error ?? 'Failed to start mirroring',
      errorCode: (result as { code?: 'server-missing' | 'failed' }).code ?? 'failed',
    });
    return;
  }

  let port: MessagePort;
  try {
    port = await takePort(result.sessionId);
  } catch (error) {
    void window.electronAPI.stopInAppMirror(result.sessionId);
    update({ status: 'error', error: error instanceof Error ? error.message : String(error), errorCode: 'failed' });
    return;
  }
  if (generation !== startGeneration) {
    port.close();
    void window.electronAPI.stopInAppMirror(result.sessionId);
    return;
  }
  activeSession = new MirrorSession(result.sessionId, port);
  if (primaryCanvas) activeSession.attachCanvas(primaryCanvas);
}

async function stopActiveSession(): Promise<void> {
  const session = activeSession;
  activeSession = null;
  if (!session) return;
  session.dispose();
  await window.electronAPI.stopInAppMirror(session.sessionId).catch(() => {});
}

export async function stopMirror(): Promise<void> {
  startGeneration++;
  // Update synchronously so a panel that remounts right away (tab switch
  // back, StrictMode, HMR) sees the idle state and can start again.
  if (snapshot.status !== 'idle' || snapshot.error) {
    update({ status: 'idle', error: null, errorCode: null, screenOff: false, stats: EMPTY_STATS });
  }
  await stopActiveSession();
}

export function clearMirrorError(): void {
  if (snapshot.status === 'error') update({ status: 'idle', error: null, errorCode: null });
}

export function setMirrorPinned(pinned: boolean): void {
  update({ pinned });
}

export function setMirrorQuality(qualityId: string): void {
  if (!MIRROR_QUALITY_PRESETS.some((preset) => preset.id === qualityId)) return;
  update({ qualityId });
  persist();
}

export function setMirrorPrefs(patch: Partial<MirrorPrefs>): void {
  update({ prefs: { ...snapshot.prefs, ...patch } });
  persist();
}

export function sendMirrorControl(request: MirrorControlRequest): void {
  activeSession?.send({ type: 'control', request });
}

export function pasteHostClipboard(): void {
  activeSession?.send({ type: 'paste' });
}

export function setDeviceScreenOff(off: boolean): void {
  if (!activeSession) return;
  sendMirrorControl({ type: 'display-power', on: !off });
  update({ screenOff: off });
}

/**
 * Attach a canvas as the paint target. The most recently attached canvas
 * wins; detaching falls back to any other attached canvas.
 */
export function attachMirrorCanvas(canvas: HTMLCanvasElement): () => void {
  attachedCanvases.add(canvas);
  primaryCanvas = canvas;
  activeSession?.attachCanvas(canvas);
  return () => {
    attachedCanvases.delete(canvas);
    activeSession?.detachCanvas(canvas);
    if (primaryCanvas === canvas) {
      const fallback = [...attachedCanvases].pop() ?? null;
      primaryCanvas = fallback;
      if (fallback) activeSession?.attachCanvas(fallback);
    }
  };
}
