import assert from 'node:assert/strict';
import test from 'node:test';
import { fuzzyMatch, scoreItem } from '../renderer/commands/fuzzy.ts';
import { captureFileName, sanitizeFileLabel } from './capture-names.ts';

function rank(query: string, titles: string[]): string[] {
  return titles
    .map((title) => ({ title, match: scoreItem(query, { title }) }))
    .filter((entry) => entry.match)
    .sort((a, b) => b.match!.score - a.match!.score)
    .map((entry) => entry.title);
}

test('prefix beats word-start beats substring', () => {
  assert.deepEqual(rank('re', ['Force stop app', 'Restart app', 'Take screenshot', 'Refresh devices']).slice(0, 2).sort(), [
    'Refresh devices',
    'Restart app',
  ]);
  const prefix = fuzzyMatch('scr', 'Screen mirror')!;
  const wordStart = fuzzyMatch('scr', 'Take screenshot')!;
  const inner = fuzzyMatch('ree', 'Take screenshot')!;
  assert.ok(prefix.score > wordStart.score);
  assert.ok(wordStart.score > inner.score);
});

test('subsequence matches prefer word starts for highlights', () => {
  const match = fuzzyMatch('sd', 'Switch device')!;
  assert.deepEqual(match.indices, [0, 7]);
  const fstop = fuzzyMatch('fstop', 'Force stop app')!;
  assert.deepEqual(fstop.indices, [0, 6, 7, 8, 9]);
});

test('non-matches return null', () => {
  assert.equal(fuzzyMatch('xyz', 'Switch device'), null);
  assert.equal(scoreItem('zzz', { title: 'Take screenshot', keywords: ['capture'] }), null);
});

test('camelCase boundaries count as word starts', () => {
  const match = fuzzyMatch('ws', 'WebSocket')!;
  assert.deepEqual(match.indices, [0, 3]);
});

test('multi-word queries can use keywords', () => {
  const match = scoreItem('reload rn', { title: 'Reload React Native app', keywords: ['rn', 'refresh', 'rr'] });
  assert.ok(match && match.score > 0);
  const byKeyword = scoreItem('png', { title: 'Take screenshot', keywords: ['png', 'capture'] });
  assert.ok(byKeyword && byKeyword.score > 0);
  assert.deepEqual(byKeyword!.indices, []);
});

test('empty query matches everything with zero score', () => {
  assert.deepEqual(scoreItem('  ', { title: 'Anything' }), { score: 0, indices: [] });
});

test('capture file names are readable and filesystem-safe', () => {
  const date = new Date(2026, 8, 29, 9, 5, 7);
  assert.equal(captureFileName('screenshot', date, 'Pixel 7'), 'Screenshot 2026-09-29 at 09.05.07 (Pixel 7).png');
  assert.equal(captureFileName('recording', date, null), 'Recording 2026-09-29 at 09.05.07.mp4');
  assert.equal(sanitizeFileLabel('sdk_gphone64/arm64: "x"'), 'sdk_gphone64 arm64 x');
});
