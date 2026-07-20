import assert from 'node:assert/strict';
import test from 'node:test';
import { LogcatMessageParser } from './logcat-parser.ts';

test('logcat parser isolates interleaved chunks from different SDK runtimes', () => {
  const parser = new LogcatMessageParser();
  const first = '{"type":"network","timestamp":1,"payload":{"id":"first"}}';
  const second = '{"type":"network","timestamp":2,"payload":{"id":"second"}}';
  const split = (value: string) => [value.slice(0, 25), value.slice(25)];
  const [firstA, firstB] = split(first);
  const [secondA, secondB] = split(second);

  assert.equal(parser.parseLogLine(`SDKMSG:source01:000001:NETWORK:-:1/2 ${firstA}`), null);
  assert.equal(parser.parseLogLine(`SDKMSG:source02:000001:NETWORK:-:1/2 ${secondA}`), null);
  assert.equal(parser.parseLogLine(`SDKMSG:source01:000001:NETWORK:-:2/2 ${firstB}`)?.payload.id, 'first');
  assert.equal(parser.parseLogLine(`SDKMSG:source02:000001:NETWORK:-:2/2 ${secondB}`)?.payload.id, 'second');
});

test('logcat parser accepts legacy messages and rejects unreasonable chunk counts', () => {
  const parser = new LogcatMessageParser();
  const legacy = parser.parseLogLine('SDKMSG:000001:LOG:-:1/1 {"type":"log","timestamp":1,"payload":{"message":"ok"}}');
  assert.equal(legacy?.type, 'log');
  assert.equal(parser.parseLogLine('SDKMSG:source01:000002:LOG:-:1/999 {}'), null);
});
