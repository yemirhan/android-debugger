import type {
  FlameChartEntry,
  HeapAnalysis,
  HeapClass,
  HeapInstance,
  MethodStats,
  MethodTraceAnalysis,
} from '@android-debugger/shared';

interface HprofParseResult {
  analysis: HeapAnalysis;
  instances: Map<number, HeapInstance[]>;
}

interface HprofRecord {
  tag: number;
  start: number;
  length: number;
}

function readId(buffer: Buffer, offset: number, idSize: number): number {
  if (offset < 0 || offset + idSize > buffer.length) throw new Error('Truncated HPROF identifier');
  if (idSize === 4) return buffer.readUInt32BE(offset);
  if (idSize === 8) return Number(buffer.readBigUInt64BE(offset));
  throw new Error(`Unsupported HPROF identifier size: ${idSize}`);
}

function valueSize(type: number, idSize: number): number {
  switch (type) {
    case 2: return idSize; // object
    case 4: return 1; // boolean
    case 5: return 2; // char
    case 6: return 4; // float
    case 7: return 8; // double
    case 8: return 1; // byte
    case 9: return 2; // short
    case 10: return 4; // int
    case 11: return 8; // long
    default: throw new Error(`Unsupported HPROF value type: ${type}`);
  }
}

function rootRecordSize(tag: number, idSize: number): number | null {
  switch (tag) {
    case 0xff: // ROOT_UNKNOWN
    case 0x05: // ROOT_STICKY_CLASS
    case 0x07: // ROOT_MONITOR_USED
    case 0x89: // ROOT_INTERNED_STRING
    case 0x8a: // ROOT_FINALIZING
    case 0x8b: // ROOT_DEBUGGER
    case 0x8c: // ROOT_REFERENCE_CLEANUP
    case 0x8d: // ROOT_VM_INTERNAL
    case 0x90: // ROOT_UNREACHABLE
      return idSize;
    case 0x01: // ROOT_JNI_GLOBAL
      return idSize * 2;
    case 0x02: // ROOT_JNI_LOCAL
    case 0x03: // ROOT_JAVA_FRAME
    case 0x08: // ROOT_THREAD_OBJECT
    case 0x8e: // ROOT_JNI_MONITOR
      return idSize + 8;
    case 0x04: // ROOT_NATIVE_STACK
    case 0x06: // ROOT_THREAD_BLOCK
      return idSize + 4;
    default:
      return null;
  }
}

function addClassSample(
  classes: Map<number, { instanceCount: number; shallowSize: number }>,
  classId: number,
  shallowSize: number
): void {
  const current = classes.get(classId) ?? { instanceCount: 0, shallowSize: 0 };
  current.instanceCount += 1;
  current.shallowSize += shallowSize;
  classes.set(classId, current);
}

export function parseHprof(buffer: Buffer): HprofParseResult {
  const terminator = buffer.indexOf(0);
  if (terminator < 0 || !buffer.subarray(0, terminator).toString('utf8').startsWith('JAVA PROFILE ')) {
    throw new Error('Invalid HPROF header');
  }
  if (terminator + 13 > buffer.length) throw new Error('Truncated HPROF header');

  const idSize = buffer.readUInt32BE(terminator + 1);
  if (idSize !== 4 && idSize !== 8) throw new Error(`Unsupported HPROF identifier size: ${idSize}`);

  const records: HprofRecord[] = [];
  let offset = terminator + 13;
  while (offset + 9 <= buffer.length) {
    const tag = buffer[offset];
    const length = buffer.readUInt32BE(offset + 5);
    const start = offset + 9;
    if (start + length > buffer.length) throw new Error('Truncated HPROF record');
    records.push({ tag, start, length });
    offset = start + length;
  }

  const strings = new Map<number, string>();
  const classNameIds = new Map<number, number>();
  for (const record of records) {
    if (record.tag === 0x01 && record.length >= idSize) {
      strings.set(readId(buffer, record.start, idSize), buffer.subarray(record.start + idSize, record.start + record.length).toString('utf8'));
    } else if (record.tag === 0x02 && record.length >= 8 + idSize * 2) {
      const classId = readId(buffer, record.start + 4, idSize);
      const nameId = readId(buffer, record.start + 8 + idSize, idSize);
      classNameIds.set(classId, nameId);
    }
  }

  const classSizes = new Map<number, number>();
  const classSamples = new Map<number, { instanceCount: number; shallowSize: number }>();
  const instances = new Map<number, HeapInstance[]>();
  let totalObjects = 0;
  let totalSize = 0;

  const rememberInstance = (id: number, classId: number, shallowSize: number): void => {
    const list = instances.get(classId) ?? [];
    if (list.length < 10_000) {
      list.push({
        id,
        classId,
        className: '',
        shallowSize,
        fields: [],
      });
      instances.set(classId, list);
    }
  };

  for (const record of records) {
    if (record.tag !== 0x0c && record.tag !== 0x1c) continue;
    let cursor = record.start;
    const end = record.start + record.length;
    while (cursor < end) {
      const tag = buffer[cursor++];
      const rootSize = rootRecordSize(tag, idSize);
      if (rootSize !== null) {
        cursor += rootSize;
        continue;
      }

      if (tag === 0xfe) { // HEAP_DUMP_INFO
        cursor += 4 + idSize;
      } else if (tag === 0x20) { // CLASS_DUMP
        const classId = readId(buffer, cursor, idSize);
        cursor += idSize + 4 + idSize * 6;
        const instanceSize = buffer.readUInt32BE(cursor);
        classSizes.set(classId, instanceSize);
        cursor += 4;

        const constantPoolCount = buffer.readUInt16BE(cursor);
        cursor += 2;
        for (let i = 0; i < constantPoolCount; i++) {
          cursor += 2;
          const type = buffer[cursor++];
          cursor += valueSize(type, idSize);
        }

        const staticFieldCount = buffer.readUInt16BE(cursor);
        cursor += 2;
        for (let i = 0; i < staticFieldCount; i++) {
          cursor += idSize;
          const type = buffer[cursor++];
          cursor += valueSize(type, idSize);
        }

        const instanceFieldCount = buffer.readUInt16BE(cursor);
        cursor += 2 + instanceFieldCount * (idSize + 1);
      } else if (tag === 0x21) { // INSTANCE_DUMP
        const objectId = readId(buffer, cursor, idSize);
        const classId = readId(buffer, cursor + idSize + 4, idSize);
        const dataLengthOffset = cursor + idSize + 4 + idSize;
        const dataLength = buffer.readUInt32BE(dataLengthOffset);
        const shallowSize = classSizes.get(classId) ?? dataLength;
        addClassSample(classSamples, classId, shallowSize);
        rememberInstance(objectId, classId, shallowSize);
        totalObjects++;
        totalSize += shallowSize;
        cursor = dataLengthOffset + 4 + dataLength;
      } else if (tag === 0x22) { // OBJECT_ARRAY_DUMP
        const objectId = readId(buffer, cursor, idSize);
        const count = buffer.readUInt32BE(cursor + idSize + 4);
        const classId = readId(buffer, cursor + idSize + 8, idSize);
        const shallowSize = count * idSize;
        addClassSample(classSamples, classId, shallowSize);
        rememberInstance(objectId, classId, shallowSize);
        totalObjects++;
        totalSize += shallowSize;
        cursor += idSize + 8 + idSize + count * idSize;
      } else if (tag === 0x23 || tag === 0xc3) { // PRIMITIVE_ARRAY_DUMP / NODATA
        const count = buffer.readUInt32BE(cursor + idSize + 4);
        const type = buffer[cursor + idSize + 8];
        const primitiveClassId = -type;
        const shallowSize = count * valueSize(type, idSize);
        addClassSample(classSamples, primitiveClassId, shallowSize);
        totalObjects++;
        totalSize += shallowSize;
        cursor += idSize + 9 + (tag === 0x23 ? shallowSize : 0);
      } else {
        throw new Error(`Unsupported HPROF heap tag: 0x${tag.toString(16)}`);
      }

      if (cursor > end) throw new Error('Truncated HPROF heap record');
    }
  }

  const primitiveNames = new Map([
    [4, 'boolean[]'], [5, 'char[]'], [6, 'float[]'], [7, 'double[]'],
    [8, 'byte[]'], [9, 'short[]'], [10, 'int[]'], [11, 'long[]'],
  ]);
  const className = (classId: number): string => {
    if (classId < 0) return primitiveNames.get(-classId) ?? `primitive[${-classId}]`;
    const nameId = classNameIds.get(classId);
    return (nameId === undefined ? undefined : strings.get(nameId))?.replaceAll('/', '.') ?? `Class@0x${classId.toString(16)}`;
  };

  const classes: HeapClass[] = Array.from(classSamples, ([id, sample]) => ({
    id,
    name: className(id),
    instanceCount: sample.instanceCount,
    shallowSize: sample.shallowSize,
  })).sort((a, b) => b.shallowSize - a.shallowSize).slice(0, 500);

  for (const [classId, values] of instances) {
    const name = className(classId);
    for (const value of values) value.className = name;
  }

  return { analysis: { totalObjects, totalSize, classes }, instances };
}

interface TraceFrame {
  methodId: number;
  startedAt: number;
  childTime: number;
}

export function parseMethodTrace(buffer: Buffer): MethodTraceAnalysis {
  const endMarker = Buffer.from('*end');
  const markerOffset = buffer.indexOf(endMarker);
  if (markerOffset < 0) throw new Error('Trace method header is missing');
  let binaryOffset = markerOffset + endMarker.length;
  if (buffer[binaryOffset] === 0x0d) binaryOffset++;
  if (buffer[binaryOffset] === 0x0a) binaryOffset++;
  if (buffer.subarray(binaryOffset, binaryOffset + 4).toString('ascii') !== 'SLOW') {
    throw new Error('Trace binary header is missing');
  }

  const header = buffer.subarray(0, markerOffset).toString('utf8');
  const methods = new Map<number, { className: string; methodName: string }>();
  let inMethods = false;
  for (const line of header.split(/\r?\n/)) {
    if (line === '*methods') {
      inMethods = true;
      continue;
    }
    if (line.startsWith('*')) {
      inMethods = false;
      continue;
    }
    if (!inMethods || !line) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const id = Number.parseInt(parts[0], 16);
    if (Number.isFinite(id)) methods.set(id, { className: parts[1].replaceAll('/', '.'), methodName: parts[2] });
  }

  const version = buffer.readUInt16LE(binaryOffset + 4);
  const dataOffset = buffer.readUInt16LE(binaryOffset + 6);
  if (version < 1 || version > 3) throw new Error(`Unsupported trace version: ${version}`);
  const defaultRecordSize = version === 1 ? 9 : version === 2 ? 10 : 14;
  const recordSize = version === 3 && binaryOffset + 18 <= buffer.length
    ? buffer.readUInt16LE(binaryOffset + 16) || defaultRecordSize
    : defaultRecordSize;
  const threadIdSize = version === 1 ? 1 : 2;
  if (recordSize < threadIdSize + 8) throw new Error('Invalid trace record size');

  const stats = new Map<number, { inclusive: number; exclusive: number; count: number }>();
  const stacks = new Map<number, TraceFrame[]>();
  for (let cursor = binaryOffset + dataOffset; cursor + recordSize <= buffer.length; cursor += recordSize) {
    const threadId = threadIdSize === 1 ? buffer[cursor] : buffer.readUInt16LE(cursor);
    const methodAndAction = buffer.readUInt32LE(cursor + threadIdSize);
    const methodId = methodAndAction & 0xfffffffc;
    const action = methodAndAction & 0x03;
    const firstTimeOffset = cursor + threadIdSize + 4;
    const timestamp = recordSize >= threadIdSize + 12
      ? buffer.readUInt32LE(firstTimeOffset + 4)
      : buffer.readUInt32LE(firstTimeOffset);
    const stack = stacks.get(threadId) ?? [];
    stacks.set(threadId, stack);

    if (action === 0) {
      const current = stats.get(methodId) ?? { inclusive: 0, exclusive: 0, count: 0 };
      current.count++;
      stats.set(methodId, current);
      stack.push({ methodId, startedAt: timestamp, childTime: 0 });
      continue;
    }
    if (action !== 1 && action !== 2) continue;

    let frameIndex = stack.length - 1;
    while (frameIndex >= 0 && stack[frameIndex].methodId !== methodId) frameIndex--;
    if (frameIndex < 0) continue;
    const [frame] = stack.splice(frameIndex, 1);
    const duration = Math.max(0, timestamp - frame.startedAt);
    const current = stats.get(methodId) ?? { inclusive: 0, exclusive: 0, count: 1 };
    current.inclusive += duration;
    current.exclusive += Math.max(0, duration - frame.childTime);
    stats.set(methodId, current);
    const parent = stack.at(-1);
    if (parent) parent.childTime += duration;
  }

  const result: MethodStats[] = [];
  for (const [methodId, timing] of stats) {
    const info = methods.get(methodId);
    if (!info) continue;
    result.push({
      className: info.className,
      methodName: info.methodName,
      inclusiveTime: timing.inclusive,
      exclusiveTime: timing.exclusive,
      callCount: timing.count,
    });
  }
  result.sort((a, b) => b.inclusiveTime - a.inclusiveTime);
  const totalTime = result.reduce((sum, method) => sum + method.exclusiveTime, 0);
  const flameChart: FlameChartEntry = {
    name: 'Captured method time',
    value: totalTime,
    children: result.filter(method => method.exclusiveTime > 0).slice(0, 100).map(method => ({
      name: `${method.className}.${method.methodName}`,
      value: method.exclusiveTime,
    })),
  };
  return { totalTime, methods: result.slice(0, 500), flameChart };
}
