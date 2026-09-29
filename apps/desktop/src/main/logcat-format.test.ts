import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Batcher,
  LineSplitter,
  TailBuffer,
  buildHistoryArgs,
  buildSdkStreamArgs,
  buildStreamArgs,
  formatLogcatSince,
  parseDeviceEpoch,
  parseLogcatLine,
  selectorArgs,
} from './logcat-format.ts';

test('parses threadtime lines with year and zone into an exact epoch', () => {
  const entry = parseLogcatLine(
    '2026-09-29 11:20:17.453 +0300  7488 22593 I NearbySharing: Network state changed: ok',
    'a'
  );
  assert.ok(entry);
  assert.equal(entry.timestamp, '2026-09-29 11:20:17.453');
  assert.equal(entry.epochMs, Date.UTC(2026, 8, 29, 8, 20, 17, 453));
  assert.equal(entry.level, 'I');
  assert.equal(entry.tag, 'NearbySharing');
  assert.equal(entry.pid, 7488);
  assert.equal(entry.tid, 22593);
  // Colons inside the message stay in the message.
  assert.equal(entry.message, 'Network state changed: ok');
});

test('handles padded short tags, tags with slashes, negative zones and empty messages', () => {
  const padded = parseLogcatLine('2026-01-02 03:04:05.006 -0500   123   456 D Foo     : hello', 'b');
  assert.equal(padded?.tag, 'Foo');
  assert.equal(padded?.message, 'hello');
  assert.equal(padded?.epochMs, Date.UTC(2026, 0, 2, 8, 4, 5, 6));

  const slash = parseLogcatLine('2026-09-29 11:19:22.083 +0000  1073  1150 D IpClient/wlan0: link down', 'c');
  assert.equal(slash?.tag, 'IpClient/wlan0');

  const empty = parseLogcatLine('2026-09-29 11:19:22.083 +0000  1073  1150 W Empty:', 'd');
  assert.equal(empty?.tag, 'Empty');
  assert.equal(empty?.message, '');

  const crlf = parseLogcatLine('2026-09-29 11:19:22.083 +0000  1073  1150 E Tag: boom\r', 'e');
  assert.equal(crlf?.message, 'boom');
});

test('parses threadtime with a uid column and without year/zone', () => {
  const withUid = parseLogcatLine('2026-09-29 11:19:22.028 +0300  wifi  1286  1286 I wpa_supplicant: deinit', 'f');
  assert.equal(withUid?.tag, 'wpa_supplicant');
  assert.equal(withUid?.pid, 1286);

  const plain = parseLogcatLine('09-29 11:19:22.028  1286  1287 V Tag: msg', 'g');
  assert.equal(plain?.timestamp, '09-29 11:19:22.028');
  assert.equal(plain?.epochMs, 0);
  assert.equal(plain?.tid, 1287);
});

test('still parses the legacy `-v time` format used by the crash buffer', () => {
  const entry = parseLogcatLine('09-29 11:20:17.453 E/AndroidRuntime( 4242): FATAL EXCEPTION: main', 'h');
  assert.equal(entry?.tag, 'AndroidRuntime');
  assert.equal(entry?.pid, 4242);
  assert.equal(entry?.message, 'FATAL EXCEPTION: main');
  const noPid = parseLogcatLine('09-29 11:20:17.453 W/Tag: text', 'i');
  assert.equal(noPid?.tag, 'Tag');
});

test('ignores buffer separators and garbage', () => {
  assert.equal(parseLogcatLine('--------- beginning of main', 'x'), null);
  assert.equal(parseLogcatLine('', 'x'), null);
  assert.equal(parseLogcatLine('random text', 'x'), null);
});

test('stream args start at the device time and never replay the buffer', () => {
  assert.deepEqual(buildStreamArgs({ mode: 'rn' }, '1790670022.139'), [
    'logcat', '-v', 'threadtime', '-v', 'year', '-v', 'zone', '-T', '1790670022.139',
    '*:S', 'ReactNative:V', 'ReactNativeJS:V',
  ]);
  const fallback = buildStreamArgs({ mode: 'device' }, null);
  assert.deepEqual(fallback.slice(-2), ['-T', '1']);
  assert.ok(!fallback.includes('-d'));
});

test('app mode scopes by uid, then pid, and refuses to fall back to the whole device', () => {
  assert.deepEqual(selectorArgs({ mode: 'app', uid: 10214, pid: 5 }), ['--uid=10214']);
  assert.deepEqual(selectorArgs({ mode: 'app', pid: 5 }), ['--pid', '5']);
  assert.throws(() => selectorArgs({ mode: 'app' }));
  assert.deepEqual(selectorArgs({ mode: 'device' }), []);
});

test('history args dump the buffer once', () => {
  const args = buildHistoryArgs({ mode: 'app', uid: 10214 });
  assert.equal(args[1], '-d');
  assert.ok(args.includes('--uid=10214'));
  assert.ok(!args.includes('-T'));
});

test('SDK stream args read only RN tags from now, scoped to the app', () => {
  const args = buildSdkStreamArgs({ uid: 10214 }, '100.000');
  assert.deepEqual(args.slice(-4), ['--uid=10214', '*:S', 'ReactNative:V', 'ReactNativeJS:V']);
  assert.ok(args.includes('ReactNativeJS:V'));
  assert.equal(args[args.indexOf('-T') + 1], '100.000');
});

test('parses device epoch output and formats -T times', () => {
  assert.deepEqual(parseDeviceEpoch('1790670018.952719642\n'), { since: '1790670018.952', epochMs: 1790670018952 });
  assert.deepEqual(parseDeviceEpoch('1790670018'), { since: '1790670018.000', epochMs: 1790670018000 });
  assert.equal(parseDeviceEpoch('1790670018.N'), null);
  assert.equal(parseDeviceEpoch('date: bad format'), null);
  assert.equal(formatLogcatSince(1790670018005), '1790670018.005');
});

test('line splitter holds partial lines until complete', () => {
  const splitter = new LineSplitter();
  assert.deepEqual(splitter.push('a\nb'), ['a']);
  assert.deepEqual(splitter.push('c\n\nd'), ['bc', '']);
  assert.deepEqual(splitter.flush(), ['d']);
  assert.deepEqual(splitter.flush(), []);
});

test('batcher coalesces pushes and drops the oldest when the consumer lags', async () => {
  const batches: Array<{ items: number[]; dropped: number }> = [];
  const batcher = new Batcher<number>((items, dropped) => batches.push({ items, dropped }), 10, 3);
  for (let i = 1; i <= 5; i++) batcher.push(i);
  assert.equal(batches.length, 0);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(batches, [{ items: [3, 4, 5], dropped: 2 }]);
  batcher.push(6);
  batcher.dispose(true);
  batcher.push(7);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(batches[1], { items: [6], dropped: 0 });
  assert.equal(batches.length, 2);
});

test('tail buffer keeps the newest items', () => {
  const tail = new TailBuffer<number>(3);
  for (let i = 1; i <= 10; i++) tail.push(i);
  assert.deepEqual(tail.toArray(), [8, 9, 10]);
});
