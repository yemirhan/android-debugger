import assert from 'node:assert/strict';
import test from 'node:test';
import type { HeapAnalysis, HeapSnapshot, HeapSnapshotKind } from '@android-debugger/shared';
import { buildHeapLeakReport, compareHeapSnapshots } from '../renderer/lib/heap-comparison.ts';

function snapshot(
  id: string,
  kind: HeapSnapshotKind,
  classes: HeapAnalysis['classes'],
  totalObjects: number,
  totalSize: number
): HeapSnapshot {
  return {
    id,
    label: id,
    kind,
    iteration: Number(id.at(-1)) || 0,
    timestamp: 1,
    dump: { id, timestamp: 1, filePath: `/tmp/${id}.hprof`, fileSize: 1, status: 'ready' },
    analysis: { classes, totalObjects, totalSize },
  };
}

test('heap comparison ranks monotonic application growth above generic storage', () => {
  const snapshots = [
    snapshot('s1', 'baseline', [
      { id: 1, name: 'com.example.DetailsViewModel', instanceCount: 1, shallowSize: 100 },
      { id: 2, name: 'byte[]', instanceCount: 100, shallowSize: 1_000 },
    ], 101, 1_100),
    snapshot('s2', 'checkpoint', [
      { id: 1, name: 'com.example.DetailsViewModel', instanceCount: 6, shallowSize: 600 },
      { id: 2, name: 'byte[]', instanceCount: 200, shallowSize: 2_000 },
    ], 206, 2_600),
    snapshot('s3', 'final', [
      { id: 1, name: 'com.example.DetailsViewModel', instanceCount: 11, shallowSize: 1_100 },
      { id: 2, name: 'byte[]', instanceCount: 300, shallowSize: 3_000 },
    ], 311, 4_100),
  ];

  const comparison = compareHeapSnapshots(snapshots, 'com.example', 10);
  assert.ok(comparison);
  assert.equal(comparison.objectDelta, 210);
  assert.equal(comparison.suspects[0].name, 'com.example.DetailsViewModel');
  assert.equal(comparison.suspects[0].monotonicGrowth, true);
  assert.equal(comparison.suspects[0].growthSteps, 2);
  assert.equal(comparison.suspects[0].appOwned, true);
  assert.equal(comparison.suspects[0].confidence, 'high');
});

test('heap report states that ranked growth is not proof of a leak', () => {
  const baseline = snapshot('s1', 'baseline', [], 10, 1_000);
  const final = snapshot('s2', 'final', [], 8, 800);
  const comparison = compareHeapSnapshots([baseline, final], 'com.example', 1);
  assert.ok(comparison);
  const report = buildHeapLeakReport({
    id: 'session',
    name: 'Open details',
    phase: 'complete',
    automation: 'manual',
    intervalSeconds: 60,
    thresholdMb: 20,
    maxSnapshots: 5,
    startedAt: 1,
    completedAt: 2,
    iterations: 1,
    snapshots: [baseline, final],
    memorySamples: [],
    comparison,
  }, 'com.example');
  assert.match(report, /not proof of a leak/i);
});
