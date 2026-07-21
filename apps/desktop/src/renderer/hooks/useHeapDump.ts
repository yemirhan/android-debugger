import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Device,
  HeapAnalysis,
  HeapCaptureAutomation,
  HeapClass,
  HeapLeakSession,
  HeapSnapshot,
  HeapSnapshotKind,
} from '@android-debugger/shared';
import { compareHeapSnapshots } from '../lib/heap-comparison';

export interface LeakSessionOptions {
  name: string;
  automation: HeapCaptureAutomation;
  intervalSeconds: number;
  thresholdMb: number;
  maxSnapshots: number;
}

export interface HeapDumpState {
  dumps: HeapSnapshot['dump'][];
  snapshots: HeapSnapshot[];
  selectedDump: HeapSnapshot['dump'] | null;
  analysis: HeapAnalysis | null;
  selectedClass: HeapClass | null;
  session: HeapLeakSession | null;
  liveMemoryPssKb: number | null;
  isCapturing: boolean;
  isAnalyzing: boolean;
  error: string | null;
}

function snapshotId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useHeapDump(device: Device | null, packageName: string) {
  const [state, setState] = useState<HeapDumpState>({
    dumps: [],
    snapshots: [],
    selectedDump: null,
    analysis: null,
    selectedClass: null,
    session: null,
    liveMemoryPssKb: null,
    isCapturing: false,
    isAnalyzing: false,
    error: null,
  });
  const sessionRef = useRef<HeapLeakSession | null>(null);
  const targetGenerationRef = useRef(0);
  const busyRef = useRef(false);
  const busyTokenRef = useRef<symbol | null>(null);
  const dumpPathsRef = useRef<string[]>([]);
  const lastAutomaticCaptureRef = useRef(0);

  const commitSession = useCallback((updater: (current: HeapLeakSession | null) => HeapLeakSession | null) => {
    setState((previous) => {
      const session = updater(previous.session);
      sessionRef.current = session;
      return { ...previous, session };
    });
  }, []);

  useEffect(() => {
    targetGenerationRef.current++;
    busyRef.current = false;
    busyTokenRef.current = null;
    sessionRef.current = null;
    setState({
      dumps: [],
      snapshots: [],
      selectedDump: null,
      analysis: null,
      selectedClass: null,
      session: null,
      liveMemoryPssKb: null,
      isCapturing: false,
      isAnalyzing: false,
      error: null,
    });

    return () => {
      targetGenerationRef.current++;
      const paths = dumpPathsRef.current;
      dumpPathsRef.current = [];
      if (paths.length > 0) void window.electronAPI.deleteHeapDumps(paths);
    };
  }, [device?.id, packageName]);

  const captureAndAnalyze = useCallback(async (
    kind: HeapSnapshotKind,
    label: string,
    iteration: number
  ): Promise<HeapSnapshot | null> => {
    if (!device || !packageName) {
      setState((previous) => ({ ...previous, error: 'No device or package selected' }));
      return null;
    }
    if (busyRef.current) {
      setState((previous) => ({ ...previous, error: 'A heap capture is already in progress' }));
      return null;
    }

    const generation = targetGenerationRef.current;
    const busyToken = Symbol('heap-capture');
    let capturedPath: string | null = null;
    busyRef.current = true;
    busyTokenRef.current = busyToken;
    setState((previous) => ({
      ...previous,
      isCapturing: true,
      isAnalyzing: false,
      error: null,
      selectedClass: null,
    }));

    try {
      const dump = await window.electronAPI.captureHeapDump(device.id, packageName);
      capturedPath = dump.filePath || null;
      if (generation !== targetGenerationRef.current) return null;
      if (dump.status === 'error') throw new Error(dump.error || 'Failed to capture heap dump');

      setState((previous) => ({ ...previous, isCapturing: false, isAnalyzing: true }));
      const analysis = await window.electronAPI.analyzeHeapDump(dump.filePath);
      if (generation !== targetGenerationRef.current) return null;
      if (!analysis) throw new Error('Failed to analyze heap dump');

      const snapshot: HeapSnapshot = {
        id: snapshotId(),
        label,
        kind,
        iteration,
        timestamp: dump.timestamp,
        dump,
        analysis,
      };
      dumpPathsRef.current = [dump.filePath, ...dumpPathsRef.current];
      capturedPath = null;
      setState((previous) => ({
        ...previous,
        dumps: [dump, ...previous.dumps],
        snapshots: [...previous.snapshots, snapshot],
        selectedDump: dump,
        analysis,
        isCapturing: false,
        isAnalyzing: false,
      }));
      return snapshot;
    } catch (error) {
      if (generation === targetGenerationRef.current) {
        setState((previous) => ({
          ...previous,
          isCapturing: false,
          isAnalyzing: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
      return null;
    } finally {
      if (capturedPath) {
        try {
          await window.electronAPI.deleteHeapDumps([capturedPath]);
        } catch {
          // Cleanup failure should not replace the capture result.
        }
      }
      if (busyTokenRef.current === busyToken) {
        busyRef.current = false;
        busyTokenRef.current = null;
      }
    }
  }, [device, packageName]);

  const analyzeDump = useCallback(async (dump: HeapSnapshot['dump']) => {
    const cached = state.snapshots.find((snapshot) => snapshot.dump.id === dump.id);
    if (cached) {
      setState((previous) => ({
        ...previous,
        selectedDump: dump,
        selectedClass: null,
        analysis: cached.analysis,
      }));
      return;
    }
    if (!dump.filePath || dump.status !== 'ready') return;

    const generation = targetGenerationRef.current;
    setState((previous) => ({ ...previous, isAnalyzing: true, selectedDump: dump, analysis: null }));
    try {
      const analysis = await window.electronAPI.analyzeHeapDump(dump.filePath);
      if (generation !== targetGenerationRef.current) return;
      setState((previous) => ({
        ...previous,
        analysis,
        isAnalyzing: false,
        error: analysis ? null : 'Failed to analyze heap dump',
      }));
    } catch (error) {
      if (generation !== targetGenerationRef.current) return;
      setState((previous) => ({
        ...previous,
        isAnalyzing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [state.snapshots]);

  const captureDump = useCallback(async () => {
    await captureAndAnalyze('manual', `Manual ${state.dumps.length + 1}`, 0);
  }, [captureAndAnalyze, state.dumps.length]);

  const selectDump = useCallback((dump: HeapSnapshot['dump']) => {
    void analyzeDump(dump);
  }, [analyzeDump]);

  const selectClass = useCallback((heapClass: HeapClass | null) => {
    setState((previous) => ({ ...previous, selectedClass: heapClass }));
  }, []);

  const startSession = useCallback(async (options: LeakSessionOptions) => {
    if (busyRef.current) return;
    const session: HeapLeakSession = {
      id: `leak-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: options.name.trim() || 'Leak investigation',
      phase: 'capturing-baseline',
      automation: options.automation,
      intervalSeconds: options.intervalSeconds,
      thresholdMb: options.thresholdMb,
      maxSnapshots: Math.max(2, Math.min(10, options.maxSnapshots)),
      startedAt: Date.now(),
      iterations: 0,
      snapshots: [],
      memorySamples: [],
    };
    sessionRef.current = session;
    setState((previous) => ({ ...previous, session, error: null }));

    const baseline = await captureAndAnalyze('baseline', 'Baseline', 0);
    if (sessionRef.current?.id !== session.id) return;
    if (!baseline) {
      commitSession((current) => current?.id === session.id
        ? { ...current, phase: 'error', error: 'Baseline capture failed' }
        : current);
      return;
    }
    commitSession((current) => current?.id === session.id
      ? { ...current, phase: 'running', snapshots: [baseline] }
      : current);
  }, [captureAndAnalyze, commitSession]);

  const markIteration = useCallback(() => {
    commitSession((current) => current && current.phase === 'running'
      ? { ...current, iterations: current.iterations + 1 }
      : current);
  }, [commitSession]);

  const captureCheckpoint = useCallback(async (automatic = false) => {
    const current = sessionRef.current;
    if (!current || current.phase !== 'running' || busyRef.current) return;
    if (current.snapshots.length >= current.maxSnapshots - 1) {
      if (!automatic) {
        setState((previous) => ({ ...previous, error: 'Checkpoint limit reached; finish the session to capture the final snapshot' }));
      }
      return;
    }

    commitSession((session) => session?.id === current.id ? { ...session, phase: 'capturing-checkpoint' } : session);
    const checkpointNumber = current.snapshots.filter((snapshot) => snapshot.kind === 'checkpoint').length + 1;
    const snapshot = await captureAndAnalyze(
      'checkpoint',
      `${automatic ? 'Automatic ' : ''}Checkpoint ${checkpointNumber}`,
      current.iterations
    );
    if (sessionRef.current?.id !== current.id) return;
    commitSession((session) => session?.id === current.id
      ? {
          ...session,
          phase: snapshot ? 'running' : 'error',
          snapshots: snapshot ? [...session.snapshots, snapshot] : session.snapshots,
          error: snapshot ? undefined : 'Checkpoint capture failed',
        }
      : session);
    if (snapshot && automatic) lastAutomaticCaptureRef.current = Date.now();
  }, [captureAndAnalyze, commitSession]);

  const finishSession = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.phase !== 'running' || busyRef.current) return;
    commitSession((session) => session?.id === current.id ? { ...session, phase: 'capturing-final' } : session);
    const finalSnapshot = await captureAndAnalyze('final', 'Final', current.iterations);
    if (sessionRef.current?.id !== current.id) return;
    if (!finalSnapshot) {
      commitSession((session) => session?.id === current.id
        ? { ...session, phase: 'error', error: 'Final capture failed' }
        : session);
      return;
    }

    commitSession((session) => {
      if (!session || session.id !== current.id) return session;
      const snapshots = [...session.snapshots, finalSnapshot];
      const comparison = compareHeapSnapshots(snapshots, packageName, session.iterations) ?? undefined;
      return {
        ...session,
        phase: 'complete',
        completedAt: Date.now(),
        snapshots,
        comparison,
      };
    });
  }, [captureAndAnalyze, commitSession, packageName]);

  const cancelSession = useCallback(() => {
    sessionRef.current = null;
    setState((previous) => ({ ...previous, session: null, liveMemoryPssKb: null }));
  }, []);

  useEffect(() => {
    const session = state.session;
    if (!session || session.phase !== 'running' || !device || !packageName) return;
    let disposed = false;

    const pollMemory = async () => {
      try {
        const info = await window.electronAPI.getMemInfo(device.id, packageName);
        if (disposed || !info || sessionRef.current?.id !== session.id) return;
        const sample = { timestamp: Date.now(), totalPssKb: info.totalPss };
        commitSession((current) => current?.id === session.id
          ? { ...current, memorySamples: [...current.memorySamples.slice(-299), sample] }
          : current);
        setState((previous) => ({ ...previous, liveMemoryPssKb: info.totalPss }));

        const current = sessionRef.current;
        const baselinePss = current?.memorySamples[0]?.totalPssKb;
        const thresholdKb = session.thresholdMb * 1024;
        if (
          session.automation === 'memory-threshold' &&
          baselinePss !== undefined &&
          info.totalPss - baselinePss >= thresholdKb &&
          Date.now() - lastAutomaticCaptureRef.current >= 30_000
        ) {
          void captureCheckpoint(true);
        }
      } catch {
        // Memory sampling is supplementary; capture failures are reported separately.
      }
    };

    void pollMemory();
    const memoryTimer = window.setInterval(pollMemory, 2_000);
    const checkpointTimer = session.automation === 'interval'
      ? window.setInterval(() => void captureCheckpoint(true), Math.max(15, session.intervalSeconds) * 1_000)
      : null;
    return () => {
      disposed = true;
      window.clearInterval(memoryTimer);
      if (checkpointTimer !== null) window.clearInterval(checkpointTimer);
    };
  }, [state.session?.id, state.session?.phase, state.session?.automation, state.session?.intervalSeconds, state.session?.thresholdMb, device?.id, packageName, captureCheckpoint, commitSession]);

  const clearDumps = useCallback(async () => {
    const paths = state.dumps.map((dump) => dump.filePath).filter(Boolean);
    dumpPathsRef.current = [];
    sessionRef.current = null;
    setState({
      dumps: [],
      snapshots: [],
      selectedDump: null,
      analysis: null,
      selectedClass: null,
      session: null,
      liveMemoryPssKb: null,
      isCapturing: false,
      isAnalyzing: false,
      error: null,
    });
    await window.electronAPI.deleteHeapDumps(paths);
  }, [state.dumps]);

  const clearError = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
  }, []);

  return {
    ...state,
    captureDump,
    selectDump,
    selectClass,
    clearDumps,
    clearError,
    startSession,
    markIteration,
    captureCheckpoint,
    finishSession,
    cancelSession,
  };
}
