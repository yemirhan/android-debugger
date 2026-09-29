import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseTarget,
  deviceNameMatches,
  isLocalDevUrl,
  isMetroStatusBody,
  parseMetroMessage,
  parseMetroPort,
  parseMetroTargets,
  rankTargets,
  resolveFrontendUrl,
  reverseListHasPort,
  serializeMetroMessage,
  targetKey,
} from './rn-devtools-protocol.ts';

const ORIGIN = 'http://127.0.0.1:8081';

// Captured from Expo SDK 54 / React Native 0.81.5 on an Android 16 emulator.
const RN_081_PAGE = {
  id: '898dc08a6855a1a782e219e7de0b0db6e26b2a04-1',
  title: 'com.androiddebugger.example (sdk_gphone64_arm64)',
  description: 'React Native Bridgeless [C++ connection]',
  appId: 'com.androiddebugger.example',
  type: 'node',
  devtoolsFrontendUrl:
    '/debugger-frontend/rn_fusebox.html?ws=%2Finspector%2Fdebug%3Fdevice%3D898dc08a6855a1a782e219e7de0b0db6e26b2a04%26page%3D1&sources.hide_add_folder=true&unstable_enableNetworkPanel=true',
  webSocketDebuggerUrl: 'ws://127.0.0.1:8081/inspector/debug?device=898dc08a6855a1a782e219e7de0b0db6e26b2a04&page=1',
  deviceName: 'sdk_gphone64_arm64 - 16 - API 36',
  reactNative: {
    logicalDeviceId: '898dc08a6855a1a782e219e7de0b0db6e26b2a04',
    capabilities: { prefersFuseboxFrontend: true, nativeSourceCodeFetching: false, nativePageReloads: true },
  },
};

// RN 0.73-style: synthetic reload-safe page plus a raw Hermes runtime page.
const RN_073_PAGES = [
  {
    id: 'dev1--1',
    title: 'React Native Experimental (Improved Chrome Reloads)',
    description: 'com.legacy.app',
    type: 'node',
    devtoolsFrontendUrl:
      'http://localhost:8081/debugger-frontend/rn_inspector.html?ws=%2Finspector%2Fdebug%3Fdevice%3Ddev1%26page%3D-1',
    webSocketDebuggerUrl: 'ws://localhost:8081/inspector/debug?device=dev1&page=-1',
    deviceName: 'Pixel 7',
    reactNative: { logicalDeviceId: 'dev1', capabilities: {} },
  },
  {
    id: 'dev1-2',
    title: 'Hermes ABI v6',
    description: 'com.legacy.app',
    type: 'node',
    devtoolsFrontendUrl: 'http://localhost:8081/debugger-frontend/rn_inspector.html?ws=x',
    webSocketDebuggerUrl: 'ws://localhost:8081/inspector/debug?device=dev1&page=2',
    deviceName: 'Pixel 7',
    reactNative: { logicalDeviceId: 'dev1', capabilities: {} },
  },
];

// metro-inspector-proxy (RN < 0.73): only Chrome's bundled frontend can open it.
const LEGACY_PAGE = {
  id: '1-2',
  title: 'React Native Experimental (Improved Chrome Reloads)',
  description: 'com.old.app',
  devtoolsFrontendUrl: 'devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=localhost:8081/inspector/debug?device=1&page=2',
  webSocketDebuggerUrl: 'ws://localhost:8081/inspector/debug?device=1&page=2',
  vm: 'Hermes',
  deviceName: 'Pixel 4',
};

test('parses RN 0.81 Fusebox targets into loadable absolute frontend URLs', () => {
  const [target] = parseMetroTargets([RN_081_PAGE], ORIGIN);
  assert.equal(target.id, RN_081_PAGE.id);
  assert.equal(target.appId, 'com.androiddebugger.example');
  assert.equal(target.description, 'React Native Bridgeless [C++ connection]');
  assert.equal(target.frontend, 'fusebox');
  assert.equal(target.reloadSafe, true);
  assert.equal(target.logicalDeviceId, '898dc08a6855a1a782e219e7de0b0db6e26b2a04');
  assert.equal(
    target.frontendUrl,
    `${ORIGIN}${RN_081_PAGE.devtoolsFrontendUrl}`
  );
  const url = new URL(target.frontendUrl!);
  assert.equal(url.searchParams.get('ws'), '/inspector/debug?device=898dc08a6855a1a782e219e7de0b0db6e26b2a04&page=1');
});

test('parses RN 0.73 inspector targets and marks the synthetic page reload-safe', () => {
  const targets = parseMetroTargets(RN_073_PAGES, ORIGIN);
  assert.equal(targets.length, 2);
  assert.equal(targets[0].frontend, 'inspector');
  assert.equal(targets[0].appId, 'com.legacy.app', 'falls back to description for the app id');
  assert.equal(targets[0].reloadSafe, true);
  assert.equal(targets[1].reloadSafe, false);
  assert.ok(targets[0].frontendUrl?.startsWith('http://localhost:8081/debugger-frontend/rn_inspector.html'));
});

test('legacy devtools:// targets cannot be embedded', () => {
  const [target] = parseMetroTargets([LEGACY_PAGE], ORIGIN);
  assert.equal(target.frontendUrl, null);
  assert.equal(target.frontend, 'external');
  assert.equal(target.rawFrontendUrl, LEGACY_PAGE.devtoolsFrontendUrl);
});

test('ignores malformed target lists', () => {
  assert.deepEqual(parseMetroTargets(null, ORIGIN), []);
  assert.deepEqual(parseMetroTargets({ id: 'x' }, ORIGIN), []);
  assert.deepEqual(parseMetroTargets([null, 3, { title: 'no id' }], ORIGIN), []);
});

test('frontend URLs must stay on this machine', () => {
  assert.equal(resolveFrontendUrl('/debugger-frontend/rn_fusebox.html?ws=a', ORIGIN), `${ORIGIN}/debugger-frontend/rn_fusebox.html?ws=a`);
  assert.equal(resolveFrontendUrl('//evil.example/x', ORIGIN), null);
  assert.equal(resolveFrontendUrl('https://evil.example/debugger-frontend/rn_fusebox.html', ORIGIN), null);
  assert.equal(resolveFrontendUrl('http://[::1]:8081/debugger-frontend/rn_fusebox.html', ORIGIN), 'http://[::1]:8081/debugger-frontend/rn_fusebox.html');
  assert.equal(resolveFrontendUrl(null, ORIGIN), null);
});

test('isLocalDevUrl only accepts http(s) on loopback hosts', () => {
  assert.equal(isLocalDevUrl('http://localhost:8081/x'), true);
  assert.equal(isLocalDevUrl('http://127.0.0.1:19000/'), true);
  assert.equal(isLocalDevUrl('https://[::1]:8081/'), true);
  assert.equal(isLocalDevUrl('http://localhost.evil.com/'), false);
  assert.equal(isLocalDevUrl('http://127.0.0.2/'), false);
  assert.equal(isLocalDevUrl('file:///etc/passwd'), false);
  assert.equal(isLocalDevUrl('devtools://devtools/bundled/js_app.html'), false);
  assert.equal(isLocalDevUrl('javascript:alert(1)'), false);
  assert.equal(isLocalDevUrl('not a url'), false);
});

test('parses Metro ports', () => {
  assert.equal(parseMetroPort(8081), 8081);
  assert.equal(parseMetroPort(' 19000 '), 19000);
  assert.equal(parseMetroPort(0), null);
  assert.equal(parseMetroPort(70000), null);
  assert.equal(parseMetroPort('80a'), null);
  assert.equal(parseMetroPort(80.5), null);
  assert.equal(parseMetroPort(undefined), null);
});

test('recognizes Metro status responses', () => {
  assert.equal(isMetroStatusBody('packager-status:running'), true);
  assert.equal(isMetroStatusBody('packager-status:running\n'), true);
  assert.equal(isMetroStatusBody('{"code":10005,"message":"Not Found"}'), false);
});

test('matches RN device names to adb models', () => {
  assert.equal(deviceNameMatches('sdk_gphone64_arm64 - 16 - API 36', 'sdk_gphone64_arm64'), true);
  assert.equal(deviceNameMatches('SM-S901E', 'SM-S901E'), true);
  assert.equal(deviceNameMatches('Pixel 7 Pro', 'Pixel 7'), false);
  assert.equal(deviceNameMatches(null, 'Pixel 7'), false);
  assert.equal(deviceNameMatches('Pixel 7', ''), false);
});

test('ranks the selected app on the selected device first', () => {
  const pages = [
    { ...RN_081_PAGE, id: 'a-1', appId: 'com.other', deviceName: 'sdk_gphone64_arm64 - 16 - API 36' },
    { ...RN_081_PAGE, id: 'b-1', appId: 'com.wanted', deviceName: 'Pixel 7' },
    { ...RN_081_PAGE, id: 'c-1', appId: 'com.wanted', deviceName: 'sdk_gphone64_arm64 - 16 - API 36' },
  ];
  const targets = parseMetroTargets(pages, ORIGIN);
  const ranked = rankTargets(targets, { packageName: 'com.wanted', deviceModel: 'sdk_gphone64_arm64' });
  assert.deepEqual(ranked.map((target) => target.id), ['c-1', 'b-1', 'a-1']);

  // With no context the most recently connected (last listed) target wins.
  assert.equal(rankTargets(targets, {})[0].id, 'c-1');
  // Reload-safe pages beat raw runtime pages from the same app.
  assert.equal(rankTargets(parseMetroTargets(RN_073_PAGES, ORIGIN), {})[0].id, 'dev1--1');
});

test('keeps the current target and follows it across app restarts', () => {
  const before = parseMetroTargets([RN_081_PAGE], ORIGIN);
  const current = { id: before[0].id, key: targetKey(before[0]) };
  assert.equal(chooseTarget(before, {}, current)?.id, before[0].id);

  // After a restart the page id changes but the app/device/title don't.
  const other = { ...RN_081_PAGE, id: 'zzz-1', appId: 'com.other', title: 'com.other (sdk_gphone64_arm64)' };
  const restarted = parseMetroTargets([{ ...RN_081_PAGE, id: `${RN_081_PAGE.reactNative.logicalDeviceId}-2` }, other], ORIGIN);
  assert.equal(chooseTarget(restarted, {}, current)?.id, `${RN_081_PAGE.reactNative.logicalDeviceId}-2`);

  assert.equal(chooseTarget([], {}, current), null);
  assert.equal(chooseTarget(restarted, { packageName: 'com.other' }, { id: null, key: null })?.id, 'zzz-1');
});

test('reads adb reverse --list output', () => {
  const output = 'emulator-5554 tcp:8081 tcp:8081\nUsbFfs tcp:9090 tcp:9090\n';
  assert.equal(reverseListHasPort(output, 8081), true);
  assert.equal(reverseListHasPort(output, 9090), true);
  assert.equal(reverseListHasPort(output, 19000), false);
  assert.equal(reverseListHasPort('(reverse) tcp:8081 tcp:8081', 8081), true);
  assert.equal(reverseListHasPort('emulator-5554 tcp:8081 tcp:19081', 8081), false);
  assert.equal(reverseListHasPort('', 8081), false);
});

test('speaks version 2 of the Metro message protocol', () => {
  assert.deepEqual(JSON.parse(serializeMetroMessage({ method: 'reload' })), { method: 'reload', version: 2 });
  assert.deepEqual(parseMetroMessage('{"version":2,"id":"x","result":{}}'), { version: 2, id: 'x', result: {} });
  assert.equal(parseMetroMessage('{"version":1,"method":"reload"}'), null);
  assert.equal(parseMetroMessage('garbage'), null);
});
