import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MonitorChannel,
  MonitorGroup,
  appendBounded,
  scopedTargetKey,
  type MonitorDriver,
  type MonitorTarget,
} from '../renderer/lib/monitoring/monitor-channel.ts';
import { clampMonitorInterval, isMonitorKind, parseLogcatEpoch, parseMonitorStart } from './monitor-protocol.ts';

test('parseLogcatEpoch reads -v epoch timestamps', () => {
  assert.equal(
    parseLogcatEpoch('         1790671179.794 22314 22335 I om.adbg.testapp: Explicit concurrent mark compact GC freed 232KB'),
    1790671179.794
  );
  assert.equal(parseLogcatEpoch('--------- beginning of main'), null);
  assert.equal(parseLogcatEpoch('09-29 11:34:37.492 I/om.adbg.testapp(22314): GC freed'), null);
  assert.equal(parseLogcatEpoch(''), null);
});

interface DriverCall {
  type: 'start' | 'stop';
  target?: MonitorTarget;
  session?: number;
  intervalMs?: number;
}

function fakeDriver(): MonitorDriver & { calls: DriverCall[]; lastSession: () => number } {
  const calls: DriverCall[] = [];
  return {
    calls,
    start(target, session, intervalMs) {
      calls.push({ type: 'start', target, session, intervalMs });
    },
    stop() {
      calls.push({ type: 'stop' });
    },
    lastSession() {
      const start = [...calls].reverse().find((call) => call.type === 'start');
      return start?.session ?? 0;
    },
  };
}

let sessionCounter = 0;
function makeChannel(scope: 'device' | 'app' = 'app', maxEntries = 3) {
  const driver = fakeDriver();
  const channel = new MonitorChannel<{ value: number }>({
    scope,
    maxEntries,
    toEntry: (payload) => payload,
    driver,
    intervalMs: 1000,
    nextSession: () => ++sessionCounter,
    now: () => 0,
  });
  return { channel, driver };
}

const APP_A: MonitorTarget = { deviceId: 'emulator-5554', packageName: 'com.example.a' };
const APP_B: MonitorTarget = { deviceId: 'emulator-5554', packageName: 'com.example.b' };
const OTHER_DEVICE: MonitorTarget = { deviceId: 'emulator-5556', packageName: 'com.example.a' };

test('appendBounded keeps the newest entries', () => {
  assert.deepEqual(appendBounded([1, 2, 3], 4, 3), [2, 3, 4]);
  assert.deepEqual(appendBounded([1], 2, 3), [1, 2]);
  assert.deepEqual(appendBounded([], 1, 0), []);
});

test('scopedTargetKey separates device-wide and app monitors', () => {
  assert.equal(scopedTargetKey('device', APP_A), scopedTargetKey('device', APP_B));
  assert.notEqual(scopedTargetKey('app', APP_A), scopedTargetKey('app', APP_B));
  assert.equal(scopedTargetKey('app', { deviceId: 'emulator-5554', packageName: '' }), '');
  assert.equal(scopedTargetKey('device', null), '');
});

test('channel starts one poller per target and keeps bounded history', () => {
  const { channel, driver } = makeChannel();
  channel.setTarget(APP_A, true);
  assert.equal(driver.calls.length, 1);
  assert.equal(channel.getState().running, true);

  const session = driver.lastSession();
  for (let value = 1; value <= 5; value++) channel.receive(session, { value });
  assert.deepEqual(channel.getState().entries.map((entry) => entry.value), [3, 4, 5]);
  assert.deepEqual(channel.getState().current, { value: 5 });

  // Re-selecting the same target is a no-op: no restart, history kept.
  channel.setTarget({ ...APP_A }, true);
  assert.equal(driver.calls.length, 1);
  assert.equal(channel.getState().entries.length, 3);
});

test('switching target resets history and drops stale samples', () => {
  const { channel, driver } = makeChannel();
  channel.setTarget(APP_A, true);
  const oldSession = driver.lastSession();
  channel.receive(oldSession, { value: 1 });

  channel.setTarget(APP_B, true);
  assert.deepEqual(
    driver.calls.map((call) => call.type),
    ['start', 'stop', 'start']
  );
  assert.equal(channel.getState().entries.length, 0);
  assert.equal(channel.getState().current, null);

  // A sample from the previous app that was still in flight.
  assert.equal(channel.receive(oldSession, { value: 99 }), false);
  assert.equal(channel.getState().entries.length, 0);

  assert.equal(channel.receive(driver.lastSession(), { value: 2 }), true);
  assert.deepEqual(channel.getState().entries, [{ value: 2 }]);
});

test('device-wide monitors survive app changes but reset on device change', () => {
  const { channel, driver } = makeChannel('device');
  channel.setTarget(APP_A, true);
  channel.receive(driver.lastSession(), { value: 1 });

  channel.setTarget(APP_B, true);
  assert.equal(driver.calls.length, 1);
  assert.equal(channel.getState().entries.length, 1);

  channel.setTarget(OTHER_DEVICE, true);
  assert.equal(channel.getState().entries.length, 0);
  assert.equal(driver.calls.at(-1)?.target?.deviceId, 'emulator-5556');
});

test('app monitors wait for an app to be selected', () => {
  const { channel, driver } = makeChannel('app');
  channel.setTarget({ deviceId: 'emulator-5554', packageName: '' }, true);
  assert.equal(driver.calls.length, 0);
  assert.equal(channel.getState().running, false);
  channel.setEnabled(true);
  assert.equal(driver.calls.length, 0);
});

test('pausing stops the poller, ignores late samples and keeps history', () => {
  const { channel, driver } = makeChannel();
  channel.setTarget(APP_A, true);
  const session = driver.lastSession();
  channel.receive(session, { value: 1 });

  channel.setEnabled(false);
  assert.equal(driver.calls.at(-1)?.type, 'stop');
  assert.equal(channel.receive(session, { value: 2 }), false);
  assert.deepEqual(channel.getState().entries, [{ value: 1 }]);

  channel.setEnabled(true);
  assert.equal(driver.calls.at(-1)?.type, 'start');
  assert.notEqual(driver.lastSession(), session);
  assert.deepEqual(channel.getState().entries, [{ value: 1 }]);
});

test('interval changes restart a running poller without losing history', () => {
  const { channel, driver } = makeChannel();
  channel.setTarget(APP_A, true);
  channel.receive(driver.lastSession(), { value: 1 });
  channel.setInterval(500);
  assert.equal(driver.calls.at(-1)?.intervalMs, 500);
  assert.equal(channel.getState().entries.length, 1);

  channel.setEnabled(false);
  const callsWhilePaused = driver.calls.length;
  channel.setInterval(2000);
  assert.equal(driver.calls.length, callsWhilePaused);
  channel.setEnabled(true);
  assert.equal(driver.calls.at(-1)?.intervalMs, 2000);
});

test('setCurrent only applies to the target it was requested for', () => {
  const { channel } = makeChannel();
  channel.setTarget(APP_A, true);
  const key = channel.getState().targetKey;
  channel.setTarget(APP_B, true);
  assert.equal(channel.setCurrent(key, { value: 1 }), false);
  assert.equal(channel.setCurrent(channel.getState().targetKey, { value: 2 }), true);
  assert.deepEqual(channel.getState().current, { value: 2 });
});

test('group honors auto-start and a global pause across target changes', () => {
  let autoStart = true;
  const memory = makeChannel('app');
  const battery = makeChannel('device');
  const group = new MonitorGroup({ memory: memory.channel, battery: battery.channel }, () => autoStart);

  group.setTarget(APP_A);
  assert.deepEqual([...group.getState().running].sort(), ['battery', 'memory']);

  group.pauseAll();
  assert.deepEqual(group.getState().running, []);
  assert.equal(group.getState().paused, true);

  // Paused stays paused when the app changes.
  group.setTarget(APP_B);
  assert.deepEqual(group.getState().running, []);

  group.resumeAll();
  assert.deepEqual([...group.getState().running].sort(), ['battery', 'memory']);
  assert.equal(group.getState().paused, false);

  // Starting one monitor lifts the global pause.
  group.pauseAll();
  group.start('memory');
  assert.deepEqual(group.getState().running, ['memory']);
  assert.equal(group.getState().paused, false);

  // With auto-start off, a new target starts nothing.
  autoStart = false;
  group.setTarget(OTHER_DEVICE);
  assert.deepEqual(group.getState().running, []);
  group.setTarget(null);
  assert.equal(group.getState().hasTarget, false);
});

test('group state is referentially stable between unrelated samples', () => {
  const memory = makeChannel('app');
  const group = new MonitorGroup({ memory: memory.channel }, () => true);
  group.setTarget(APP_A);
  const before = group.getState();
  memory.channel.receive(memory.driver.lastSession(), { value: 1 });
  assert.equal(group.getState(), before);
});

test('monitor:start requests are validated and clamped', () => {
  assert.equal(isMonitorKind('memory'), true);
  assert.equal(isMonitorKind('toString'), false);
  assert.equal(isMonitorKind('logs'), false);

  assert.equal(clampMonitorInterval('memory', 10), 250);
  assert.equal(clampMonitorInterval('threads', 10), 1000);
  assert.equal(clampMonitorInterval('battery', undefined), 5000);
  assert.equal(clampMonitorInterval('cpu', Number.NaN), 1000);
  assert.equal(clampMonitorInterval('fps', 10_000_000), 60_000);

  assert.deepEqual(parseMonitorStart('memory', 'emulator-5554', 'com.example.a', 1000, 7), {
    kind: 'memory',
    deviceId: 'emulator-5554',
    packageName: 'com.example.a',
    interval: 1000,
    session: 7,
  });
  // Battery is device-wide; the package is ignored.
  assert.equal(parseMonitorStart('battery', 'emulator-5554', 'com.example.a', 5000, 1)?.packageName, '');
  assert.equal(parseMonitorStart('memory', 'emulator-5554', '', 1000, 1), null);
  assert.equal(parseMonitorStart('memory', '', 'com.example.a', 1000, 1), null);
  assert.equal(parseMonitorStart('memory', 'emulator-5554', 'com.example.a', 1000, 0), null);
  assert.equal(parseMonitorStart('memory', 'emulator-5554', 'com.example.a', 1000, 1.5), null);
  assert.equal(parseMonitorStart('shell', 'emulator-5554', 'com.example.a', 1000, 1), null);
});
