import type {
  HeapClass,
  HeapClassDelta,
  HeapComparison,
  HeapLeakSession,
  HeapSnapshot,
} from '@android-debugger/shared';

const ONE_MB = 1024 * 1024;

function classMap(snapshot: HeapSnapshot): Map<string, HeapClass> {
  return new Map(snapshot.analysis.classes.map((heapClass) => [heapClass.name, heapClass]));
}

function confidenceFor(score: number, snapshots: number): HeapClassDelta['confidence'] {
  if (score >= 70 && snapshots >= 3) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function compareHeapSnapshots(
  snapshots: HeapSnapshot[],
  packageName: string,
  iterations: number
): HeapComparison | null {
  if (snapshots.length < 2) return null;

  const baseline = snapshots[0];
  const final = snapshots[snapshots.length - 1];
  const maps = snapshots.map(classMap);
  const names = new Set<string>();
  for (const map of maps) {
    for (const name of map.keys()) names.add(name);
  }

  const classes: HeapClassDelta[] = [];
  for (const name of names) {
    const values = maps.map((map) => map.get(name));
    const first = values[0];
    const last = values[values.length - 1];
    const baselineInstances = first?.instanceCount ?? 0;
    const finalInstances = last?.instanceCount ?? 0;
    const baselineShallowSize = first?.shallowSize ?? 0;
    const finalShallowSize = last?.shallowSize ?? 0;
    const instanceDelta = finalInstances - baselineInstances;
    const shallowSizeDelta = finalShallowSize - baselineShallowSize;
    const growthPercent = baselineInstances > 0
      ? (instanceDelta / baselineInstances) * 100
      : finalInstances > 0 ? 100 : 0;

    let growthSteps = 0;
    let monotonicGrowth = values.length > 1;
    for (let index = 1; index < values.length; index++) {
      const previous = values[index - 1]?.instanceCount ?? 0;
      const current = values[index]?.instanceCount ?? 0;
      if (current > previous) growthSteps++;
      if (current < previous) monotonicGrowth = false;
    }
    monotonicGrowth = monotonicGrowth && instanceDelta > 0;

    const appOwned = Boolean(packageName) && (
      name === packageName ||
      name.startsWith(`${packageName}.`) ||
      name.startsWith(packageName.replaceAll('.', '/'))
    );
    const reasons: string[] = [];
    let score = 0;

    if (instanceDelta > 0 || shallowSizeDelta > 0) {
      if (appOwned) {
        score += 25;
        reasons.push('Application-owned class');
      }
      if (monotonicGrowth) {
        score += snapshots.length >= 3 ? 25 : 12;
        reasons.push(snapshots.length === 2
          ? 'Grew between baseline and final'
          : `Grew across ${growthSteps} capture transition${growthSteps === 1 ? '' : 's'}`);
      }
      if (growthSteps === snapshots.length - 1 && snapshots.length >= 3) {
        score += 15;
        reasons.push('Grew at every capture transition');
      }
      if (shallowSizeDelta >= ONE_MB) {
        score += 20;
        reasons.push('Added at least 1 MB of shallow data');
      } else if (shallowSizeDelta >= 256 * 1024) {
        score += 12;
        reasons.push('Added at least 256 KB of shallow data');
      } else if (shallowSizeDelta > 0) {
        score += 4;
      }
      if (iterations > 0 && instanceDelta >= iterations) {
        score += 10;
        reasons.push('Growth tracks workflow repetitions');
      }
      if (growthPercent >= 100 && instanceDelta >= 5) score += 8;
      if (/^(?:byte|char|int|long|float|double|boolean|short)\[\]$/.test(name)) {
        score = Math.max(0, score - 8);
        reasons.push('Primitive storage; inspect its retaining owner');
      }
    }

    classes.push({
      name,
      baselineInstances,
      finalInstances,
      instanceDelta,
      baselineShallowSize,
      finalShallowSize,
      shallowSizeDelta,
      growthPercent,
      growthSteps,
      snapshotCount: snapshots.length,
      monotonicGrowth,
      appOwned,
      score,
      confidence: confidenceFor(score, snapshots.length),
      reasons,
    });
  }

  classes.sort((left, right) =>
    right.score - left.score ||
    right.shallowSizeDelta - left.shallowSizeDelta ||
    right.instanceDelta - left.instanceDelta
  );
  const growingClasses = classes.filter((item) => item.instanceDelta > 0 || item.shallowSizeDelta > 0).length;
  const suspects = classes.filter((item) => item.score >= 30 && (item.instanceDelta > 0 || item.shallowSizeDelta > 0));

  return {
    baselineObjects: baseline.analysis.totalObjects,
    finalObjects: final.analysis.totalObjects,
    objectDelta: final.analysis.totalObjects - baseline.analysis.totalObjects,
    baselineSize: baseline.analysis.totalSize,
    finalSize: final.analysis.totalSize,
    sizeDelta: final.analysis.totalSize - baseline.analysis.totalSize,
    snapshotsCompared: snapshots.length,
    growingClasses,
    suspects,
    classes,
  };
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
}

function bytes(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const absolute = Math.abs(value);
  if (absolute < 1024) return `${sign}${absolute} B`;
  if (absolute < ONE_MB) return `${sign}${(absolute / 1024).toFixed(1)} KB`;
  return `${sign}${(absolute / ONE_MB).toFixed(1)} MB`;
}

export function buildHeapLeakReport(session: HeapLeakSession, packageName: string): string {
  const comparison = session.comparison;
  if (!comparison) return `Leak investigation "${session.name}" does not have a completed comparison.`;

  const lines = [
    `Heap leak investigation: ${session.name}`,
    `Package: ${packageName}`,
    `Started: ${new Date(session.startedAt).toLocaleString()}`,
    `Workflow iterations: ${session.iterations}`,
    `Snapshots compared: ${comparison.snapshotsCompared}`,
    '',
    'Summary',
    `- Parsed objects: ${comparison.baselineObjects.toLocaleString()} -> ${comparison.finalObjects.toLocaleString()} (${signed(comparison.objectDelta)})`,
    `- Parsed shallow size: ${bytes(comparison.baselineSize).slice(1)} -> ${bytes(comparison.finalSize).slice(1)} (${bytes(comparison.sizeDelta)})`,
    `- Growing classes: ${comparison.growingClasses.toLocaleString()}`,
    `- Ranked candidates: ${comparison.suspects.length.toLocaleString()}`,
    '',
    'Top candidates',
  ];

  if (comparison.suspects.length === 0) {
    lines.push('- No class crossed the current suspicion threshold. This does not prove that no leak exists.');
  } else {
    for (const suspect of comparison.suspects.slice(0, 15)) {
      lines.push(
        `- [${suspect.confidence.toUpperCase()}] ${suspect.name}: ${signed(suspect.instanceDelta)} instances, ${bytes(suspect.shallowSizeDelta)} shallow; ${suspect.reasons.join('; ')}`
      );
    }
  }

  lines.push(
    '',
    'Interpretation note',
    'This report ranks persistent class-level growth between snapshots. Growth is evidence to investigate, not proof of a leak. Retained size and paths to GC roots require reference-graph analysis.'
  );
  return lines.join('\n');
}
