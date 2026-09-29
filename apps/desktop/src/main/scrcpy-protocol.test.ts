import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ByteQueue,
  DeviceMessageParser,
  VideoStreamParser,
  VIDEO_CODEC_IDS,
  buildServerShellArgs,
  encodeControlRequest,
  extractServerError,
  floatToI16FixedPoint,
  floatToU16FixedPoint,
  formatScid,
  isSupportedServerVersion,
  parseScrcpyVersion,
  parseServerVersionMismatch,
  serializeBackOrScreenOn,
  serializeInjectKeycode,
  serializeInjectScrollEvent,
  serializeInjectText,
  serializeInjectTouchEvent,
  serializeSetClipboard,
  serializeSetDisplayPower,
  socketNameForScid,
  utf8Truncate,
  POINTER_ID_MOUSE,
  POINTER_ID_GENERIC_FINGER,
} from './scrcpy-protocol.ts';
import { avcCodecStringFromConfig, findNalUnits, mergeConfigAndFrame } from '../renderer/lib/mirror/h264.ts';
import { translateKeyEvent, ANDROID_META } from '../renderer/lib/mirror/keymap.ts';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function mediaHeader(opts: { config?: boolean; key?: boolean; pts?: bigint; size: number }): number[] {
  let ptsAndFlags = opts.config ? 1n << 62n : opts.pts ?? 0n;
  if (opts.key) ptsAndFlags |= 1n << 61n;
  const buf = Buffer.alloc(12);
  buf.writeBigUInt64BE(ptsAndFlags, 0);
  buf.writeUInt32BE(opts.size, 8);
  return [...buf];
}

function sessionHeader(width: number, height: number, clientResized = false): number[] {
  return [0x80, 0, 0, clientResized ? 1 : 0, ...u32(width), ...u32(height)];
}

function deviceName(name: string): number[] {
  const out = new Array(64).fill(0);
  Buffer.from(name, 'utf8').forEach((byte, index) => (out[index] = byte));
  return out;
}

// --- Video stream --------------------------------------------------------------

test('video parser reads dummy byte, device meta, codec, session and packets', () => {
  const config = [0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1f, 0, 0, 0, 1, 0x68, 0xce];
  const frame = [0, 0, 0, 1, 0x65, 1, 2, 3];
  const stream = new Uint8Array([
    0, // dummy byte
    ...deviceName('Pixel 9'),
    ...u32(VIDEO_CODEC_IDS.h264),
    ...sessionHeader(1080, 2400),
    ...mediaHeader({ config: true, size: config.length }),
    ...config,
    ...mediaHeader({ key: true, pts: 123456n, size: frame.length }),
    ...frame,
  ]);

  const parser = new VideoStreamParser({ expectDummyByte: true, expectDeviceMeta: true });
  const events = parser.push(stream);
  assert.deepEqual(events.map((event) => event.type), ['device-meta', 'codec', 'session', 'packet', 'packet']);
  assert.deepEqual(events[0], { type: 'device-meta', deviceName: 'Pixel 9' });
  assert.deepEqual(events[1], { type: 'codec', codecId: VIDEO_CODEC_IDS.h264, codec: 'h264' });
  assert.deepEqual(events[2], { type: 'session', width: 1080, height: 2400, clientResized: false });
  const configPacket = events[3];
  assert.equal(configPacket.type, 'packet');
  if (configPacket.type !== 'packet') return;
  assert.equal(configPacket.config, true);
  assert.equal(configPacket.keyFrame, false);
  assert.equal(configPacket.pts, null);
  assert.deepEqual([...configPacket.data], config);
  const keyPacket = events[4];
  if (keyPacket.type !== 'packet') throw new Error('expected packet');
  assert.equal(keyPacket.config, false);
  assert.equal(keyPacket.keyFrame, true);
  assert.equal(keyPacket.pts, 123456);
  assert.deepEqual([...keyPacket.data], frame);
});

test('video parser handles arbitrary chunk boundaries', () => {
  const payload = Array.from({ length: 300 }, (_, i) => i & 0xff);
  const stream = new Uint8Array([
    ...u32(VIDEO_CODEC_IDS.h264),
    ...sessionHeader(720, 1600, true),
    ...mediaHeader({ pts: 42n, size: payload.length }),
    ...payload,
    ...sessionHeader(1600, 720),
  ]);
  for (const chunkSize of [1, 2, 5, 11, 13, 64]) {
    const parser = new VideoStreamParser({ expectDummyByte: false, expectDeviceMeta: false });
    const events = [];
    for (let offset = 0; offset < stream.length; offset += chunkSize) {
      events.push(...parser.push(stream.subarray(offset, offset + chunkSize)));
    }
    assert.deepEqual(
      events.map((event) => event.type),
      ['codec', 'session', 'packet', 'session'],
      `chunk size ${chunkSize}`
    );
    assert.deepEqual(events[1], { type: 'session', width: 720, height: 1600, clientResized: true });
    const packet = events[2];
    if (packet.type !== 'packet') throw new Error('expected packet');
    assert.equal(packet.pts, 42);
    assert.equal(packet.keyFrame, false);
    assert.deepEqual([...packet.data], payload);
    assert.deepEqual(events[3], { type: 'session', width: 1600, height: 720, clientResized: false });
  }
});

test('video parser reports disabled streams and rejects absurd sizes', () => {
  const disabled = new VideoStreamParser({ expectDummyByte: false, expectDeviceMeta: false });
  assert.deepEqual(disabled.push(new Uint8Array(u32(1))), [{ type: 'disabled', error: true }]);
  assert.deepEqual(disabled.push(new Uint8Array([1, 2, 3, 4])), []);

  const explicit = new VideoStreamParser({ expectDummyByte: false, expectDeviceMeta: false });
  assert.deepEqual(explicit.push(new Uint8Array(u32(0))), [{ type: 'disabled', error: false }]);

  const corrupt = new VideoStreamParser({ expectDummyByte: false, expectDeviceMeta: false });
  corrupt.push(new Uint8Array(u32(VIDEO_CODEC_IDS.h264)));
  assert.throws(() => corrupt.push(new Uint8Array(mediaHeader({ pts: 1n, size: 0x7fffffff }))), /too large/);
});

test('byte queue reads across chunks', () => {
  const queue = new ByteQueue();
  queue.push(new Uint8Array([1, 2]));
  queue.push(new Uint8Array([3]));
  queue.push(new Uint8Array([4, 5, 6]));
  assert.equal(queue.length, 6);
  assert.equal(queue.peekByte(3), 4);
  assert.deepEqual([...queue.read(4)], [1, 2, 3, 4]);
  assert.equal(queue.peekByte(0), 5);
  assert.deepEqual([...queue.read(2)], [5, 6]);
  assert.throws(() => queue.read(1), RangeError);
});

// --- Control messages (vectors from scrcpy app/tests/test_control_msg_serialize.c) ---

test('serializes inject keycode', () => {
  // AKEY_EVENT_ACTION_UP, AKEYCODE_ENTER, repeat 5, meta shift|shift_left
  assert.equal(hex(serializeInjectKeycode(1, 66, 5, 0x41)), '00' + '01' + '00000042' + '00000005' + '00000041');
});

test('serializes inject text and truncates at a UTF-8 boundary', () => {
  assert.equal(hex(serializeInjectText('hello, world!')), '01' + '0000000d' + Buffer.from('hello, world!').toString('hex'));
  const long = serializeInjectText('a'.repeat(299) + 'é' + 'b');
  // 'é' is 2 bytes and would straddle the 300 byte limit: it is dropped.
  assert.equal(long.length, 1 + 4 + 299);
  assert.equal(new DataView(long.buffer).getUint32(1), 299);
  assert.deepEqual([...utf8Truncate(new TextEncoder().encode('ab€'), 3)], [0x61, 0x62]);
});

test('serializes inject touch event', () => {
  const bytes = serializeInjectTouchEvent({
    action: 0,
    pointerId: 0x1234567887654321n,
    position: { x: 100, y: 200, screenWidth: 1080, screenHeight: 1920 },
    pressure: 1,
    actionButton: 1,
    buttons: 1,
  });
  assert.equal(
    hex(bytes),
    '02' + '00' + '1234567887654321' + '00000064' + '000000c8' + '0438' + '0780' + 'ffff' + '00000001' + '00000001'
  );
  const mouse = serializeInjectTouchEvent({
    action: 1,
    pointerId: POINTER_ID_MOUSE,
    position: { x: 0, y: 0, screenWidth: 10, screenHeight: 10 },
    pressure: 0,
    actionButton: 1,
    buttons: 0,
  });
  assert.equal(hex(mouse.subarray(2, 10)), 'ffffffffffffffff');
  assert.equal(hex(mouse.subarray(22, 24)), '0000');
  const finger = serializeInjectTouchEvent({
    action: 2,
    pointerId: POINTER_ID_GENERIC_FINGER,
    position: { x: 0, y: 0, screenWidth: 10, screenHeight: 10 },
    pressure: 0.5,
    actionButton: 0,
    buttons: 0,
  });
  assert.equal(hex(finger.subarray(2, 10)), 'fffffffffffffffe');
  assert.equal(hex(finger.subarray(22, 24)), '8000');
});

test('serializes inject scroll event', () => {
  const bytes = serializeInjectScrollEvent({
    position: { x: 260, y: 1026, screenWidth: 1080, screenHeight: 1920 },
    hScroll: 16,
    vScroll: -16,
    buttons: 1,
  });
  assert.equal(hex(bytes), '03' + '00000104' + '00000402' + '0438' + '0780' + '7fff' + '8000' + '00000001');
  const small = serializeInjectScrollEvent({
    position: { x: 0, y: 0, screenWidth: 1, screenHeight: 1 },
    hScroll: 0,
    vScroll: 1,
    buttons: 0,
  });
  // 1/16 in i16 fixed point
  assert.equal(hex(small.subarray(13, 17)), '0000' + '0800');
  // Out-of-range values are clamped to [-16, 16]
  const clamped = serializeInjectScrollEvent({
    position: { x: 0, y: 0, screenWidth: 1, screenHeight: 1 },
    hScroll: 100,
    vScroll: -100,
    buttons: 0,
  });
  assert.equal(hex(clamped.subarray(13, 17)), '7fff8000');
});

test('serializes other control messages', () => {
  assert.equal(hex(serializeBackOrScreenOn(1)), '0401');
  assert.equal(hex(serializeSetDisplayPower(true)), '0a01');
  assert.equal(hex(serializeSetDisplayPower(false)), '0a00');
  assert.equal(
    hex(serializeSetClipboard(0x5555555555555555n, 'hello, world!', true)),
    '09' + '5555555555555555' + '01' + '0000000d' + Buffer.from('hello, world!').toString('hex')
  );
});

test('fixed point conversions match scrcpy', () => {
  assert.equal(floatToU16FixedPoint(0), 0);
  assert.equal(floatToU16FixedPoint(0.5), 0x8000);
  assert.equal(floatToU16FixedPoint(1), 0xffff);
  assert.equal(floatToU16FixedPoint(2), 0xffff);
  assert.equal(floatToI16FixedPoint(1), 0x7fff);
  assert.equal(floatToI16FixedPoint(-1), -0x8000);
  assert.equal(floatToI16FixedPoint(0.5), 0x4000);
});

test('encodes renderer control requests and rejects malformed ones', () => {
  const touch = encodeControlRequest({ type: 'touch', action: 0, x: 5000, y: -3, width: 1080, height: 2400, buttons: 1, actionButton: 1 });
  assert.ok(touch);
  const view = new DataView(touch!.buffer);
  assert.equal(view.getInt32(10), 1079, 'x clamped into the screen');
  assert.equal(view.getInt32(14), 0, 'y clamped into the screen');
  assert.equal(view.getUint16(18), 1080);
  assert.equal(view.getUint16(20), 2400);
  assert.equal(view.getUint16(22), 0xffff, 'down defaults to full pressure');

  assert.equal(hex(encodeControlRequest({ type: 'rotate' })!), '0b');
  assert.equal(hex(encodeControlRequest({ type: 'reset-video' })!), '11');
  assert.equal(hex(encodeControlRequest({ type: 'expand-notifications' })!), '05');
  assert.equal(hex(encodeControlRequest({ type: 'get-clipboard', copyKey: 1 })!), '0801');
  assert.equal(hex(encodeControlRequest({ type: 'key', action: 0, keycode: 3 })!), '00' + '00' + '00000003' + '00000000' + '00000000');

  for (const bad of [
    null,
    'touch',
    { type: 'nope' },
    { type: 'key', action: 5, keycode: 3 },
    { type: 'key', action: 0, keycode: -1 },
    { type: 'touch', action: 0, x: 1, y: 1, width: 0, height: 10 },
    { type: 'touch', action: 9, x: 1, y: 1, width: 10, height: 10 },
    { type: 'scroll', x: 1, y: 1, width: 10, height: 10, hScroll: 'x', vScroll: 1 },
    { type: 'text', text: '' },
    { type: 'display-power', on: 'yes' },
    { type: 'get-clipboard', copyKey: 7 },
  ]) {
    assert.equal(encodeControlRequest(bad), null, JSON.stringify(bad));
  }
});

test('device message parser handles clipboard, ack and split input', () => {
  const text = 'copied ✓';
  const textBytes = [...Buffer.from(text, 'utf8')];
  const stream = new Uint8Array([
    0, ...u32(textBytes.length), ...textBytes,
    1, 0, 0, 0, 0, 0, 0, 0, 7,
    2, 0, 3, 0, 2, 0xaa, 0xbb,
  ]);
  const parser = new DeviceMessageParser();
  const messages = [];
  for (const byte of stream) messages.push(...parser.push(new Uint8Array([byte])));
  assert.deepEqual(messages[0], { type: 'clipboard', text });
  assert.deepEqual(messages[1], { type: 'ack-clipboard', sequence: 7n });
  assert.equal(messages[2].type, 'uhid-output');
  assert.throws(() => new DeviceMessageParser().push(new Uint8Array([9])), /Unknown/);
});

// --- Server launch helpers -----------------------------------------------------------

test('builds the server command line', () => {
  const args = buildServerShellArgs({
    version: '4.1',
    remotePath: '/data/local/tmp/adbg-scrcpy-0000abcd.jar',
    scid: 0xabcd,
    maxSize: 1280,
    videoBitRate: 8_000_000,
    maxFps: 60,
    stayAwake: true,
    showTouches: false,
  });
  assert.deepEqual(args.slice(0, 6), [
    'CLASSPATH=/data/local/tmp/adbg-scrcpy-0000abcd.jar',
    'app_process',
    '/',
    'com.genymobile.scrcpy.Server',
    '4.1',
    'scid=0000abcd',
  ]);
  for (const expected of ['tunnel_forward=true', 'audio=false', 'control=true', 'cleanup=true', 'video_codec=h264', 'max_size=1280', 'video_bit_rate=8000000', 'max_fps=60', 'stay_awake=true', 'show_touches=false']) {
    assert.ok(args.includes(expected), expected);
  }
  assert.throws(() => buildServerShellArgs({ ...baseParams(), version: '4.1; rm -rf /' }), /version/);
  assert.throws(() => buildServerShellArgs({ ...baseParams(), remotePath: '/sdcard/x.jar' }), /path/);
});

function baseParams() {
  return {
    version: '4.1',
    remotePath: '/data/local/tmp/a.jar',
    scid: 1,
    maxSize: 0,
    videoBitRate: 1_000_000,
    maxFps: 60,
    stayAwake: false,
    showTouches: false,
  };
}

test('scid formatting and socket names', () => {
  assert.equal(formatScid(0x12345678), '12345678');
  assert.equal(formatScid(0xab), '000000ab');
  assert.equal(socketNameForScid(0x1f), 'scrcpy_0000001f');
});

test('parses versions and server errors', () => {
  assert.equal(parseScrcpyVersion('scrcpy 4.1 <https://github.com/Genymobile/scrcpy>\n\nDependencies'), '4.1');
  assert.equal(parseScrcpyVersion('scrcpy 3.3.4 <https://x>'), '3.3.4');
  assert.equal(parseScrcpyVersion('something else'), null);
  const mismatch =
    '[server] ERROR: Exception on thread Thread[main,5,main]\njava.lang.IllegalArgumentException: The server version (4.1) does not match the client (4.0)';
  assert.equal(parseServerVersionMismatch(mismatch), '4.1');
  assert.equal(parseServerVersionMismatch('ok'), null);
  assert.equal(
    extractServerError('[server] INFO: Device: x\n[server] ERROR: Could not open video stream\n'),
    'Could not open video stream'
  );
  assert.equal(extractServerError('[server] INFO: fine'), null);
});

// --- H.264 helpers (renderer) -------------------------------------------------------

test('finds NAL units and derives the avc1 codec string from the SPS', () => {
  const config = new Uint8Array([0, 0, 0, 1, 0x67, 0x64, 0x00, 0x28, 0xac, 0, 0, 1, 0x68, 0xee, 0x3c]);
  const nals = findNalUnits(config);
  assert.deepEqual(nals.map((nal) => nal.type), [7, 8]);
  assert.equal(nals[0].offset, 4);
  assert.equal(nals[0].end, 9);
  assert.equal(avcCodecStringFromConfig(config), 'avc1.640028');
  assert.equal(avcCodecStringFromConfig(new Uint8Array([0, 0, 1, 0x68, 1])), null);
  assert.deepEqual([...mergeConfigAndFrame(new Uint8Array([1, 2]), new Uint8Array([3]))], [1, 2, 3]);
});

// --- Keyboard mapping (renderer) -----------------------------------------------------

const key = (over: Partial<Parameters<typeof translateKeyEvent>[0]>) => ({
  key: '',
  code: '',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  ...over,
});

test('keyboard: printable characters become text, special keys become key codes', () => {
  assert.deepEqual(translateKeyEvent(key({ key: 'a', code: 'KeyA' }), 'down'), { kind: 'text', text: 'a' });
  assert.deepEqual(translateKeyEvent(key({ key: 'a', code: 'KeyA' }), 'up'), { kind: 'ignore' });
  assert.deepEqual(translateKeyEvent(key({ key: 'A', code: 'KeyA', shiftKey: true }), 'down'), { kind: 'text', text: 'A' });
  assert.deepEqual(translateKeyEvent(key({ key: ' ', code: 'Space' }), 'down'), { kind: 'text', text: ' ' });
  assert.deepEqual(translateKeyEvent(key({ key: 'Enter', code: 'Enter' }), 'down'), { kind: 'key', keycode: 66, metaState: 0, repeat: 0 });
  assert.deepEqual(translateKeyEvent(key({ key: 'Backspace', code: 'Backspace', repeat: true }), 'down'), {
    kind: 'key',
    keycode: 67,
    metaState: 0,
    repeat: 1,
  });
  assert.deepEqual(translateKeyEvent(key({ key: 'ArrowLeft', code: 'ArrowLeft' }), 'up'), { kind: 'key', keycode: 21, metaState: 0, repeat: 0 });
  assert.deepEqual(translateKeyEvent(key({ key: 'F5', code: 'F5' }), 'down'), { kind: 'key', keycode: 135, metaState: 0, repeat: 0 });
});

test('keyboard: ctrl shortcuts are key codes with meta state; cmd is for the host', () => {
  assert.deepEqual(translateKeyEvent(key({ key: 'a', code: 'KeyA', ctrlKey: true }), 'down'), {
    kind: 'key',
    keycode: 29,
    metaState: ANDROID_META.CTRL_ON | ANDROID_META.CTRL_LEFT_ON,
    repeat: 0,
  });
  assert.deepEqual(translateKeyEvent(key({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), 'down'), {
    kind: 'key',
    keycode: 54,
    metaState: ANDROID_META.CTRL_ON | ANDROID_META.CTRL_LEFT_ON | ANDROID_META.SHIFT_ON | ANDROID_META.SHIFT_LEFT_ON,
    repeat: 0,
  });
  assert.deepEqual(translateKeyEvent(key({ key: 'v', code: 'KeyV', metaKey: true }), 'down'), { kind: 'clipboard', action: 'paste' });
  assert.deepEqual(translateKeyEvent(key({ key: 'c', code: 'KeyC', metaKey: true }), 'down'), { kind: 'clipboard', action: 'copy' });
  assert.deepEqual(translateKeyEvent(key({ key: 'x', code: 'KeyX', metaKey: true }), 'down'), { kind: 'clipboard', action: 'cut' });
  assert.deepEqual(translateKeyEvent(key({ key: 'k', code: 'KeyK', metaKey: true }), 'down'), { kind: 'ignore' });
  assert.deepEqual(translateKeyEvent(key({ key: 'v', code: 'KeyV', metaKey: true }), 'up'), { kind: 'ignore' });
  assert.deepEqual(translateKeyEvent(key({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), 'down'), { kind: 'ignore' });
  assert.deepEqual(translateKeyEvent(key({ key: 'Dead', code: 'KeyE', altKey: true }), 'down'), { kind: 'ignore' });
});

test('isSupportedServerVersion only accepts the 4.x+ stream layout', () => {
  assert.equal(isSupportedServerVersion('4.1'), true);
  assert.equal(isSupportedServerVersion('4.0'), true);
  assert.equal(isSupportedServerVersion('10.2-rc1'), true);
  assert.equal(isSupportedServerVersion('3.1'), false);
  assert.equal(isSupportedServerVersion('3.3.4'), false);
  assert.equal(isSupportedServerVersion('2.7'), false);
  // Unknown versions are allowed; the server reports its own on a mismatch.
  assert.equal(isSupportedServerVersion(null), true);
  assert.equal(isSupportedServerVersion(''), true);
});
