import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAmStartError, parseResolvedActivity } from './launch-parsers.ts';

// Captured from an Android 16 (API 36) emulator.
const RESOLVED = `priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false
com.adbg.testapp/android.app.Activity
`;

test('resolve-activity: returns the component line', () => {
  assert.equal(parseResolvedActivity(RESOLVED, 'com.adbg.testapp'), 'com.adbg.testapp/android.app.Activity');
  assert.equal(parseResolvedActivity('com.example/.MainActivity\n', 'com.example'), 'com.example/.MainActivity');
});

test('resolve-activity: no launcher activity', () => {
  assert.equal(parseResolvedActivity('No activity found\n', 'com.android.shell'), null);
});

test('resolve-activity: ignores components of other packages', () => {
  assert.equal(parseResolvedActivity('com.other/.Main\n', 'com.example'), null);
});

test('am start: success has no error', () => {
  const output =
    'Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] cmp=com.adbg.testapp/android.app.Activity }\n';
  assert.equal(parseAmStartError(output), null);
  assert.equal(
    parseAmStartError(`${output}Warning: Activity not started, intent has been delivered to currently running top-most instance.\n`),
    null
  );
});

test('am start: reports the error line', () => {
  const output = `Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] cmp=com.adbg.testapp/.Nope }
Error type 3
Error: Activity class {com.adbg.testapp/com.adbg.testapp.Nope} does not exist.
`;
  assert.equal(parseAmStartError(output), 'Activity class {com.adbg.testapp/com.adbg.testapp.Nope} does not exist.');
});

test('am start: surfaces security exceptions', () => {
  const output = 'Starting: Intent { cmp=com.example/.Hidden }\njava.lang.SecurityException: Permission Denial: starting Intent\n';
  assert.equal(parseAmStartError(output), 'Permission Denial: starting Intent');
});
