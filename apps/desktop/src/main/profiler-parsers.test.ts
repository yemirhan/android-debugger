import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHprof, parseMethodTrace } from './profiler-parsers.ts';

function traceRecord(threadId: number, methodAndAction: number, threadTime: number, globalTime: number): Buffer {
  const record = Buffer.alloc(14);
  record.writeUInt16LE(threadId, 0);
  record.writeUInt32LE(methodAndAction, 2);
  record.writeUInt32LE(threadTime, 6);
  record.writeUInt32LE(globalTime, 10);
  return record;
}

test('method trace parser derives inclusive, exclusive, and call timings', () => {
  const textHeader = Buffer.from([
    '*version',
    '3',
    'clock=dual',
    '*threads',
    '1\tmain',
    '*methods',
    '4\tcom/example/Foo\touter\t()V',
    '8\tcom/example/Foo\tinner\t()V',
    '*end',
    '',
  ].join('\n'));
  const binaryHeader = Buffer.alloc(18);
  binaryHeader.write('SLOW', 0, 'ascii');
  binaryHeader.writeUInt16LE(3, 4);
  binaryHeader.writeUInt16LE(18, 6);
  binaryHeader.writeUInt16LE(14, 16);
  const trace = Buffer.concat([
    textHeader,
    binaryHeader,
    traceRecord(1, 4, 0, 0),
    traceRecord(1, 8, 10, 10),
    traceRecord(1, 9, 30, 30),
    traceRecord(1, 5, 50, 50),
  ]);

  const analysis = parseMethodTrace(trace);
  const outer = analysis.methods.find((method) => method.methodName === 'outer');
  const inner = analysis.methods.find((method) => method.methodName === 'inner');
  assert.deepEqual(outer, {
    className: 'com.example.Foo', methodName: 'outer', inclusiveTime: 50, exclusiveTime: 30, callCount: 1,
  });
  assert.deepEqual(inner, {
    className: 'com.example.Foo', methodName: 'inner', inclusiveTime: 20, exclusiveTime: 20, callCount: 1,
  });
  assert.equal(analysis.totalTime, 50);
});

function hprofRecord(tag: number, data: Buffer): Buffer {
  const header = Buffer.alloc(9);
  header[0] = tag;
  header.writeUInt32BE(data.length, 5);
  return Buffer.concat([header, data]);
}

test('HPROF parser counts instances and arrays without fabricating retained size', () => {
  const header = Buffer.alloc(Buffer.byteLength('JAVA PROFILE 1.0.3') + 1 + 4 + 8);
  header.write('JAVA PROFILE 1.0.3', 0, 'ascii');
  const terminator = Buffer.byteLength('JAVA PROFILE 1.0.3');
  header.writeUInt32BE(4, terminator + 1);

  const loadClass = Buffer.alloc(16);
  loadClass.writeUInt32BE(1, 0);
  loadClass.writeUInt32BE(2, 4);
  loadClass.writeUInt32BE(1, 12);
  const string = Buffer.alloc(4 + Buffer.byteLength('com/example/Foo'));
  string.writeUInt32BE(1, 0);
  string.write('com/example/Foo', 4, 'utf8');

  const classDump = Buffer.alloc(1 + 4 + 4 + 4 * 6 + 4 + 2 + 2 + 2);
  let cursor = 0;
  classDump[cursor++] = 0x20;
  classDump.writeUInt32BE(2, cursor); cursor += 4 + 4 + 4 * 6;
  classDump.writeUInt32BE(16, cursor); cursor += 4;
  classDump.writeUInt16BE(0, cursor); cursor += 2;
  classDump.writeUInt16BE(0, cursor); cursor += 2;
  classDump.writeUInt16BE(0, cursor);

  const instance = Buffer.alloc(1 + 4 + 4 + 4 + 4 + 4);
  cursor = 0;
  instance[cursor++] = 0x21;
  instance.writeUInt32BE(3, cursor); cursor += 4;
  cursor += 4;
  instance.writeUInt32BE(2, cursor); cursor += 4;
  instance.writeUInt32BE(4, cursor);

  const byteArray = Buffer.alloc(1 + 4 + 4 + 4 + 1 + 3);
  cursor = 0;
  byteArray[cursor++] = 0x23;
  byteArray.writeUInt32BE(4, cursor); cursor += 4 + 4;
  byteArray.writeUInt32BE(3, cursor); cursor += 4;
  byteArray[cursor++] = 8;
  byteArray.set([1, 2, 3], cursor);

  const result = parseHprof(Buffer.concat([
    header,
    hprofRecord(0x02, loadClass),
    hprofRecord(0x01, string),
    hprofRecord(0x1c, Buffer.concat([classDump, instance, byteArray])),
  ]));
  assert.equal(result.analysis.totalObjects, 2);
  assert.equal(result.analysis.totalSize, 19);
  const foo = result.analysis.classes.find((heapClass) => heapClass.id === 2);
  assert.deepEqual(foo, { id: 2, name: 'com.example.Foo', instanceCount: 1, shallowSize: 16 });
  assert.equal(result.instances.get(2)?.[0].className, 'com.example.Foo');
});
