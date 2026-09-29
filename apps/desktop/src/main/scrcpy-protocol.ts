/**
 * Pure (I/O-free) pieces of the scrcpy 4.x client/server protocol:
 *  - the video socket demuxer (dummy byte, device meta, codec id, session
 *    packets and media packets with their 12-byte frame header),
 *  - the control message serializer (client -> device),
 *  - the device message parser (device -> client, on the control socket),
 *  - helpers to build the server command line and parse versions.
 *
 * Reference: scrcpy v4.1 doc/develop.md, server Streamer.java,
 * DesktopConnection.java, ControlMessageReader.java, DeviceMessageWriter.java
 * and app/src/control_msg.c. The protocol is internal to scrcpy and changes
 * between versions, which is why the server version must match exactly.
 *
 * Kept free of runtime imports so it runs under `node --experimental-strip-types`
 * in unit tests.
 */

// ---------------------------------------------------------------------------
// Codecs
// ---------------------------------------------------------------------------

export const VIDEO_CODEC_IDS: Record<string, number> = {
  h264: 0x68323634,
  h265: 0x68323635,
  av1: 0x00617631,
  vp8: 0x00767038,
  vp9: 0x00767039,
};

export function videoCodecName(codecId: number): string | null {
  for (const [name, id] of Object.entries(VIDEO_CODEC_IDS)) {
    if (id === codecId) return name;
  }
  return null;
}

/** Device name field sent on the first socket (NUL padded). */
export const DEVICE_NAME_FIELD_LENGTH = 64;
/** Size of both the session packet and the media packet header. */
export const PACKET_HEADER_LENGTH = 12;
/** Refuse absurd packet sizes instead of buffering forever on a corrupt stream. */
export const MAX_PACKET_SIZE = 32 * 1024 * 1024;

const PTS_MASK = (1n << 61n) - 1n;

// ---------------------------------------------------------------------------
// Byte queue: accumulates socket chunks without re-concatenating on every push
// ---------------------------------------------------------------------------

export class ByteQueue {
  private chunks: Uint8Array[] = [];
  private head = 0; // read offset into chunks[0]
  private total = 0;

  get length(): number {
    return this.total;
  }

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.total += chunk.length;
  }

  /** Copy the next `n` bytes out of the queue (n must be <= length). */
  read(n: number): Uint8Array {
    if (n > this.total) throw new RangeError(`ByteQueue underflow: ${n} > ${this.total}`);
    const out = new Uint8Array(n);
    let written = 0;
    while (written < n) {
      const chunk = this.chunks[0];
      const available = chunk.length - this.head;
      const take = Math.min(available, n - written);
      out.set(chunk.subarray(this.head, this.head + take), written);
      written += take;
      this.head += take;
      if (this.head === chunk.length) {
        this.chunks.shift();
        this.head = 0;
      }
    }
    this.total -= n;
    return out;
  }

  /** Read the byte at `offset` without consuming (offset must be < length). */
  peekByte(offset: number): number {
    let index = 0;
    let pos = this.head + offset;
    while (pos >= this.chunks[index].length) {
      pos -= this.chunks[index].length;
      index++;
    }
    return this.chunks[index][pos];
  }
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  return (BigInt(readU32(bytes, offset)) << 32n) | BigInt(readU32(bytes, offset + 4));
}

// ---------------------------------------------------------------------------
// Video socket demuxer
// ---------------------------------------------------------------------------

export type VideoStreamEvent =
  | { type: 'device-meta'; deviceName: string }
  | { type: 'codec'; codecId: number; codec: string | null }
  /** The device disabled the stream; `error` means a configuration error (must stop). */
  | { type: 'disabled'; error: boolean }
  /** A new capture session (start, rotation, fold...): frames now have this size. */
  | { type: 'session'; width: number; height: number; clientResized: boolean }
  | {
      type: 'packet';
      config: boolean;
      keyFrame: boolean;
      /** Presentation timestamp in microseconds (null for config packets). */
      pts: number | null;
      data: Uint8Array;
    };

export interface VideoStreamParserOptions {
  /** A dummy byte precedes everything on the first socket of a forward tunnel. */
  expectDummyByte: boolean;
  /** The 64-byte device name is sent on the first socket. */
  expectDeviceMeta: boolean;
}

type ParserStage = 'dummy' | 'device-meta' | 'codec' | 'header' | 'payload' | 'disabled';

export class VideoStreamParser {
  private queue = new ByteQueue();
  private stage: ParserStage;
  private pendingHeader: { config: boolean; keyFrame: boolean; pts: number | null; size: number } | null = null;
  private readonly expectDeviceMeta: boolean;

  constructor(options: VideoStreamParserOptions) {
    this.expectDeviceMeta = options.expectDeviceMeta;
    this.stage = options.expectDummyByte ? 'dummy' : options.expectDeviceMeta ? 'device-meta' : 'codec';
  }

  /** Feed raw socket bytes; returns every complete event they unlock, in order. */
  push(chunk: Uint8Array): VideoStreamEvent[] {
    this.queue.push(chunk);
    const events: VideoStreamEvent[] = [];
    for (;;) {
      const event = this.next();
      if (event === undefined) break;
      if (event !== null) events.push(event);
    }
    return events;
  }

  /** undefined = need more data; null = consumed something without an event. */
  private next(): VideoStreamEvent | null | undefined {
    switch (this.stage) {
      case 'dummy': {
        if (this.queue.length < 1) return undefined;
        this.queue.read(1);
        this.stage = this.expectDeviceMeta ? 'device-meta' : 'codec';
        return null;
      }
      case 'device-meta': {
        if (this.queue.length < DEVICE_NAME_FIELD_LENGTH) return undefined;
        const raw = this.queue.read(DEVICE_NAME_FIELD_LENGTH);
        const end = raw.indexOf(0);
        const deviceName = new TextDecoder().decode(end === -1 ? raw : raw.subarray(0, end));
        this.stage = 'codec';
        return { type: 'device-meta', deviceName };
      }
      case 'codec': {
        if (this.queue.length < 4) return undefined;
        const codecId = readU32(this.queue.read(4), 0);
        if (codecId === 0 || codecId === 1) {
          this.stage = 'disabled';
          return { type: 'disabled', error: codecId === 1 };
        }
        this.stage = 'header';
        return { type: 'codec', codecId, codec: videoCodecName(codecId) };
      }
      case 'header': {
        if (this.queue.length < PACKET_HEADER_LENGTH) return undefined;
        const header = this.queue.read(PACKET_HEADER_LENGTH);
        if (header[0] & 0x80) {
          // Session packet: 1000...000R | width u32 | height u32
          return {
            type: 'session',
            clientResized: (header[3] & 1) === 1,
            width: readU32(header, 4),
            height: readU32(header, 8),
          };
        }
        const ptsAndFlags = readU64(header, 0);
        const size = readU32(header, 8);
        if (size > MAX_PACKET_SIZE) {
          throw new Error(`scrcpy packet too large (${size} bytes); the stream is out of sync`);
        }
        const config = (header[0] & 0x40) !== 0;
        const keyFrame = (header[0] & 0x20) !== 0;
        this.pendingHeader = {
          config,
          keyFrame,
          pts: config ? null : Number(ptsAndFlags & PTS_MASK),
          size,
        };
        this.stage = 'payload';
        return null;
      }
      case 'payload': {
        const header = this.pendingHeader!;
        if (this.queue.length < header.size) return undefined;
        const data = this.queue.read(header.size);
        this.pendingHeader = null;
        this.stage = 'header';
        return { type: 'packet', config: header.config, keyFrame: header.keyFrame, pts: header.pts, data };
      }
      case 'disabled':
        return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Control messages (client -> device)
// ---------------------------------------------------------------------------

export const CONTROL_MSG_TYPE = {
  INJECT_KEYCODE: 0,
  INJECT_TEXT: 1,
  INJECT_TOUCH_EVENT: 2,
  INJECT_SCROLL_EVENT: 3,
  BACK_OR_SCREEN_ON: 4,
  EXPAND_NOTIFICATION_PANEL: 5,
  EXPAND_SETTINGS_PANEL: 6,
  COLLAPSE_PANELS: 7,
  GET_CLIPBOARD: 8,
  SET_CLIPBOARD: 9,
  SET_DISPLAY_POWER: 10,
  ROTATE_DEVICE: 11,
  OPEN_HARD_KEYBOARD_SETTINGS: 15,
  START_APP: 16,
  RESET_VIDEO: 17,
} as const;

/** android.view.KeyEvent actions */
export const KEY_ACTION = { DOWN: 0, UP: 1 } as const;
/** android.view.MotionEvent actions */
export const MOTION_ACTION = { DOWN: 0, UP: 1, MOVE: 2, CANCEL: 3, HOVER_MOVE: 7 } as const;
/** android.view.MotionEvent buttons */
export const MOTION_BUTTON = { PRIMARY: 1, SECONDARY: 2, TERTIARY: 4, BACK: 8, FORWARD: 16 } as const;

/** Well-known pointer ids used by the scrcpy client. */
export const POINTER_ID_MOUSE = -1n;
export const POINTER_ID_GENERIC_FINGER = -2n;

export const INJECT_TEXT_MAX_LENGTH = 300;
export const CONTROL_MSG_MAX_SIZE = 1 << 18;
export const CLIPBOARD_TEXT_MAX_LENGTH = CONTROL_MSG_MAX_SIZE - 14;

export const COPY_KEY = { NONE: 0, COPY: 1, CUT: 2 } as const;

export interface ScreenPosition {
  x: number;
  y: number;
  /** Must equal the current video frame size, or the server ignores the event. */
  screenWidth: number;
  screenHeight: number;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function writePosition(view: DataView, offset: number, position: ScreenPosition): void {
  view.setInt32(offset, clampInt(position.x, -0x80000000, 0x7fffffff));
  view.setInt32(offset + 4, clampInt(position.y, -0x80000000, 0x7fffffff));
  view.setUint16(offset + 8, clampInt(position.screenWidth, 0, 0xffff));
  view.setUint16(offset + 10, clampInt(position.screenHeight, 0, 0xffff));
}

/** float in [0, 1] -> u16 fixed point (1.0 saturates to 0xffff), as sc_float_to_u16fp. */
export function floatToU16FixedPoint(value: number): number {
  const f = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const u = Math.floor(f * 0x10000);
  return u >= 0xffff ? 0xffff : u;
}

/** float in [-1, 1] -> i16 fixed point (1.0 saturates to 0x7fff), as sc_float_to_i16fp. */
export function floatToI16FixedPoint(value: number): number {
  const f = Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0));
  const i = Math.trunc(f * 0x8000);
  return i >= 0x7fff ? 0x7fff : i;
}

/**
 * Truncate UTF-8 bytes to at most maxLength without splitting a code point
 * (sc_str_utf8_truncation_index).
 */
export function utf8Truncate(bytes: Uint8Array, maxLength: number): Uint8Array {
  if (bytes.length <= maxLength) return bytes;
  let len = maxLength;
  // Move back while the byte at `len` is a continuation byte (10xxxxxx).
  while (len > 0 && (bytes[len] & 0xc0) === 0x80) len--;
  return bytes.subarray(0, len);
}

export function serializeInjectKeycode(action: number, keycode: number, repeat = 0, metaState = 0): Uint8Array {
  const buf = new Uint8Array(14);
  const view = new DataView(buf.buffer);
  buf[0] = CONTROL_MSG_TYPE.INJECT_KEYCODE;
  buf[1] = action;
  view.setInt32(2, keycode | 0);
  view.setUint32(6, repeat >>> 0);
  view.setUint32(10, metaState >>> 0);
  return buf;
}

function serializeString(type: number, prefix: Uint8Array, text: string, maxLength: number): Uint8Array {
  const bytes = utf8Truncate(new TextEncoder().encode(text), maxLength);
  const buf = new Uint8Array(1 + prefix.length + 4 + bytes.length);
  const view = new DataView(buf.buffer);
  buf[0] = type;
  buf.set(prefix, 1);
  view.setUint32(1 + prefix.length, bytes.length);
  buf.set(bytes, 1 + prefix.length + 4);
  return buf;
}

export function serializeInjectText(text: string): Uint8Array {
  return serializeString(CONTROL_MSG_TYPE.INJECT_TEXT, new Uint8Array(0), text, INJECT_TEXT_MAX_LENGTH);
}

export interface TouchEventInput {
  action: number;
  pointerId: bigint;
  position: ScreenPosition;
  pressure: number;
  actionButton: number;
  buttons: number;
}

export function serializeInjectTouchEvent(event: TouchEventInput): Uint8Array {
  const buf = new Uint8Array(32);
  const view = new DataView(buf.buffer);
  buf[0] = CONTROL_MSG_TYPE.INJECT_TOUCH_EVENT;
  buf[1] = event.action;
  view.setBigUint64(2, BigInt.asUintN(64, event.pointerId));
  writePosition(view, 10, event.position);
  view.setUint16(22, floatToU16FixedPoint(event.pressure));
  view.setUint32(24, event.actionButton >>> 0);
  view.setUint32(28, event.buttons >>> 0);
  return buf;
}

export interface ScrollEventInput {
  position: ScreenPosition;
  /** Scroll amounts in [-16, 16] (clamped). */
  hScroll: number;
  vScroll: number;
  buttons: number;
}

export function serializeInjectScrollEvent(event: ScrollEventInput): Uint8Array {
  const buf = new Uint8Array(21);
  const view = new DataView(buf.buffer);
  buf[0] = CONTROL_MSG_TYPE.INJECT_SCROLL_EVENT;
  writePosition(view, 1, event.position);
  view.setInt16(13, floatToI16FixedPoint(event.hScroll / 16));
  view.setInt16(15, floatToI16FixedPoint(event.vScroll / 16));
  view.setUint32(17, event.buttons >>> 0);
  return buf;
}

export function serializeBackOrScreenOn(action: number): Uint8Array {
  return Uint8Array.of(CONTROL_MSG_TYPE.BACK_OR_SCREEN_ON, action);
}

export function serializeGetClipboard(copyKey: number): Uint8Array {
  return Uint8Array.of(CONTROL_MSG_TYPE.GET_CLIPBOARD, copyKey);
}

export function serializeSetClipboard(sequence: bigint, text: string, paste: boolean): Uint8Array {
  const prefix = new Uint8Array(9);
  new DataView(prefix.buffer).setBigUint64(0, BigInt.asUintN(64, sequence));
  prefix[8] = paste ? 1 : 0;
  return serializeString(CONTROL_MSG_TYPE.SET_CLIPBOARD, prefix, text, CLIPBOARD_TEXT_MAX_LENGTH);
}

export function serializeSetDisplayPower(on: boolean): Uint8Array {
  return Uint8Array.of(CONTROL_MSG_TYPE.SET_DISPLAY_POWER, on ? 1 : 0);
}

/** Messages with no payload (rotate, expand/collapse panels, reset video...). */
export function serializeEmpty(type: number): Uint8Array {
  return Uint8Array.of(type);
}

// ---------------------------------------------------------------------------
// Device messages (device -> client, on the control socket)
// ---------------------------------------------------------------------------

export type DeviceMessage =
  | { type: 'clipboard'; text: string }
  | { type: 'ack-clipboard'; sequence: bigint }
  | { type: 'uhid-output'; id: number; data: Uint8Array };

export class DeviceMessageParser {
  private queue = new ByteQueue();

  push(chunk: Uint8Array): DeviceMessage[] {
    this.queue.push(chunk);
    const messages: DeviceMessage[] = [];
    for (;;) {
      const message = this.next();
      if (!message) break;
      messages.push(message);
    }
    return messages;
  }

  private next(): DeviceMessage | null {
    if (this.queue.length < 1) return null;
    const type = this.queue.peekByte(0);
    const peekU32 = (offset: number) =>
      ((this.queue.peekByte(offset) << 24) >>> 0) +
      (this.queue.peekByte(offset + 1) << 16) +
      (this.queue.peekByte(offset + 2) << 8) +
      this.queue.peekByte(offset + 3);
    switch (type) {
      case 0: {
        if (this.queue.length < 5) return null;
        const len = peekU32(1);
        if (len > CONTROL_MSG_MAX_SIZE) throw new Error('scrcpy clipboard message too large');
        if (this.queue.length < 5 + len) return null;
        const raw = this.queue.read(5 + len);
        return { type: 'clipboard', text: new TextDecoder().decode(raw.subarray(5)) };
      }
      case 1: {
        if (this.queue.length < 9) return null;
        const raw = this.queue.read(9);
        return { type: 'ack-clipboard', sequence: readU64(raw, 1) };
      }
      case 2: {
        if (this.queue.length < 5) return null;
        const size = (this.queue.peekByte(3) << 8) | this.queue.peekByte(4);
        if (this.queue.length < 5 + size) return null;
        const raw = this.queue.read(5 + size);
        return { type: 'uhid-output', id: (raw[1] << 8) | raw[2], data: raw.slice(5) };
      }
      default:
        throw new Error(`Unknown scrcpy device message type: ${type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Server launch helpers
// ---------------------------------------------------------------------------

export const SCRCPY_SERVER_CLASS = 'com.genymobile.scrcpy.Server';

/** scid is a 31-bit non-negative number, formatted as 8 hex digits on the wire. */
export function formatScid(scid: number): string {
  return (scid & 0x7fffffff).toString(16).padStart(8, '0');
}

export function socketNameForScid(scid: number): string {
  return `scrcpy_${formatScid(scid)}`;
}

export interface ScrcpyServerParams {
  version: string;
  remotePath: string;
  scid: number;
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
  stayAwake: boolean;
  showTouches: boolean;
  powerOffOnClose?: boolean;
}

/** Arguments for `adb shell` that start the server (adb joins them with spaces). */
export function buildServerShellArgs(params: ScrcpyServerParams): string[] {
  if (!/^[0-9A-Za-z.+-]+$/.test(params.version)) throw new Error('Invalid scrcpy version');
  if (!/^\/data\/local\/tmp\/[A-Za-z0-9._-]+$/.test(params.remotePath)) throw new Error('Invalid server path');
  const int = (value: number, min: number, max: number) => String(clampInt(value, min, max));
  return [
    `CLASSPATH=${params.remotePath}`,
    'app_process',
    '/',
    SCRCPY_SERVER_CLASS,
    params.version,
    `scid=${formatScid(params.scid)}`,
    'log_level=info',
    'tunnel_forward=true',
    'audio=false',
    'control=true',
    'cleanup=true',
    'video_codec=h264',
    `max_size=${int(params.maxSize, 0, 8192)}`,
    `video_bit_rate=${int(params.videoBitRate, 100_000, 100_000_000)}`,
    `max_fps=${int(params.maxFps, 1, 240)}`,
    `stay_awake=${params.stayAwake ? 'true' : 'false'}`,
    `show_touches=${params.showTouches ? 'true' : 'false'}`,
    `power_off_on_close=${params.powerOffOnClose ? 'true' : 'false'}`,
    'clipboard_autosync=false',
  ];
}

/** "scrcpy 4.1 <https://...>" -> "4.1" */
export function parseScrcpyVersion(output: string): string | null {
  const match = output.match(/^scrcpy\s+v?(\d+(?:\.\d+)*(?:[-+.][0-9A-Za-z.]+)?)/m);
  return match ? match[1] : null;
}

/** Oldest scrcpy major version whose stream layout the demuxer understands. */
export const MIN_SCRCPY_SERVER_MAJOR = 4;

/**
 * Whether the in-app mirror can talk to this server version. scrcpy 3.x uses
 * a different video header (codec + size, no session packets, other flag
 * bits), so it would desync the parser. Unknown versions are allowed: the
 * server itself reports its version on a mismatch and that is checked again.
 */
export function isSupportedServerVersion(version: string | null | undefined): boolean {
  if (!version) return true;
  const major = Number.parseInt(version, 10);
  return !Number.isFinite(major) || major >= MIN_SCRCPY_SERVER_MAJOR;
}

/** Server reply when the version argument does not match the jar. */
export function parseServerVersionMismatch(output: string): string | null {
  const match = output.match(/server version \(([^)\s]+)\) does not match the client/);
  return match ? match[1] : null;
}

/** Last `[server] ERROR:` line, with the prefix removed. */
export function extractServerError(output: string): string | null {
  const lines = output.split(/\r?\n/).filter((line) => /\bERROR:/.test(line));
  if (lines.length === 0) return null;
  return lines[lines.length - 1].replace(/^.*?ERROR:\s*/, '').trim() || null;
}

// ---------------------------------------------------------------------------
// Renderer control requests -> wire bytes
// ---------------------------------------------------------------------------

/**
 * Structured control requests (MirrorControlRequest in the renderer's mirror
 * types) arrive over the mirror MessagePort. They are validated and
 * serialized here, never trusted as raw bytes. Clipboard paste is handled by
 * the session because it needs the host clipboard.
 */
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isAction = (value: unknown, allowed: readonly number[]): value is number =>
  isNum(value) && allowed.includes(value);

function clampPosition(r: { x: number; y: number; width: number; height: number }): ScreenPosition {
  return {
    x: Math.min(r.width - 1, Math.max(0, r.x)),
    y: Math.min(r.height - 1, Math.max(0, r.y)),
    screenWidth: r.width,
    screenHeight: r.height,
  };
}

/** Serialize a renderer request, or return null when it is malformed. */
export function encodeControlRequest(request: unknown): Uint8Array | null {
  if (!request || typeof request !== 'object') return null;
  const r = request as Record<string, unknown>;
  const hasPosition = () =>
    isNum(r.x) && isNum(r.y) && isNum(r.width) && isNum(r.height) && r.width > 0 && r.height > 0;
  switch (r.type) {
    case 'key':
      if (!isAction(r.action, [KEY_ACTION.DOWN, KEY_ACTION.UP]) || !isNum(r.keycode)) return null;
      if (r.keycode < 0 || r.keycode > 1000) return null;
      return serializeInjectKeycode(
        r.action,
        r.keycode,
        isNum(r.repeat) ? Math.max(0, r.repeat) : 0,
        isNum(r.metaState) ? r.metaState : 0
      );
    case 'text':
      if (typeof r.text !== 'string' || r.text.length === 0) return null;
      return serializeInjectText(r.text);
    case 'touch': {
      const actions = [MOTION_ACTION.DOWN, MOTION_ACTION.UP, MOTION_ACTION.MOVE, MOTION_ACTION.CANCEL, MOTION_ACTION.HOVER_MOVE];
      if (!isAction(r.action, actions) || !hasPosition()) return null;
      return serializeInjectTouchEvent({
        action: r.action,
        pointerId: r.pointer === 'finger' ? POINTER_ID_GENERIC_FINGER : POINTER_ID_MOUSE,
        position: clampPosition(r as { x: number; y: number; width: number; height: number }),
        pressure: isNum(r.pressure) ? r.pressure : r.action === MOTION_ACTION.UP ? 0 : 1,
        actionButton: isNum(r.actionButton) ? r.actionButton : 0,
        buttons: isNum(r.buttons) ? r.buttons : 0,
      });
    }
    case 'scroll':
      if (!hasPosition() || !isNum(r.hScroll) || !isNum(r.vScroll)) return null;
      return serializeInjectScrollEvent({
        position: clampPosition(r as { x: number; y: number; width: number; height: number }),
        hScroll: r.hScroll,
        vScroll: r.vScroll,
        buttons: isNum(r.buttons) ? r.buttons : 0,
      });
    case 'back-or-screen-on':
      if (!isAction(r.action, [KEY_ACTION.DOWN, KEY_ACTION.UP])) return null;
      return serializeBackOrScreenOn(r.action);
    case 'display-power':
      if (typeof r.on !== 'boolean') return null;
      return serializeSetDisplayPower(r.on);
    case 'rotate':
      return serializeEmpty(CONTROL_MSG_TYPE.ROTATE_DEVICE);
    case 'expand-notifications':
      return serializeEmpty(CONTROL_MSG_TYPE.EXPAND_NOTIFICATION_PANEL);
    case 'expand-settings':
      return serializeEmpty(CONTROL_MSG_TYPE.EXPAND_SETTINGS_PANEL);
    case 'collapse-panels':
      return serializeEmpty(CONTROL_MSG_TYPE.COLLAPSE_PANELS);
    case 'reset-video':
      return serializeEmpty(CONTROL_MSG_TYPE.RESET_VIDEO);
    case 'get-clipboard':
      if (!isAction(r.copyKey, [COPY_KEY.NONE, COPY_KEY.COPY, COPY_KEY.CUT])) return null;
      return serializeGetClipboard(r.copyKey);
    default:
      return null;
  }
}
