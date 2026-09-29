import assert from 'node:assert/strict';
import test from 'node:test';
import { androidKeyCode } from './android-keys.ts';

test('resolves names, KEYCODE_ prefixes, aliases, digits and letters', () => {
  assert.equal(androidKeyCode('HOME'), 3);
  assert.equal(androidKeyCode('keycode_back'), 4);
  assert.equal(androidKeyCode('recents'), 187);
  assert.equal(androidKeyCode('app switch'), 187);
  assert.equal(androidKeyCode('ENTER'), 66);
  assert.equal(androidKeyCode('5'), 12);
  assert.equal(androidKeyCode('a'), 29);
  assert.equal(androidKeyCode('NOT_A_KEY'), null);
});
