import { useState, useCallback, useRef, useEffect } from 'react';
import type { MethodTraceInfo, MethodTraceAnalysis, Device } from '@android-debugger/shared';

export interface MethodTraceState {
  traces: MethodTraceInfo[];
  selectedTrace: MethodTraceInfo | null;
  analysis: MethodTraceAnalysis | null;
  isRecording: boolean;
  isAnalyzing: boolean;
  recordingDuration: number;
  error: string | null;
}

export function useMethodTrace(device: Device | null, packageName: string) {
  const [state, setState] = useState<MethodTraceState>({
    traces: [],
    selectedTrace: null,
    analysis: null,
    isRecording: false,
    isAnalyzing: false,
    recordingDuration: 0,
    error: null,
  });

  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartRef = useRef<number>(0);
  // Bumped on target change so in-flight start/stop results for a previous
  // device/package don't flip the recording state of the new one.
  const targetGenerationRef = useRef(0);
  // Latest trace whose analysis was requested; older responses are dropped.
  const analyzingTraceIdRef = useRef<string | null>(null);

  // Stop an active device-side profiler when the panel or target goes away.
  useEffect(() => {
    return () => {
      targetGenerationRef.current++;
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      void window.electronAPI.cancelMethodTrace();
      // The device-side trace was cancelled, so the recording UI must not stay active.
      setState(prev => (prev.isRecording || prev.recordingDuration
        ? { ...prev, isRecording: false, recordingDuration: 0 }
        : prev));
    };
  }, [device?.id, packageName]);

  const startRecording = useCallback(async () => {
    if (!device || !packageName) {
      setState(prev => ({ ...prev, error: 'No device or package selected' }));
      return;
    }

    const generation = targetGenerationRef.current;
    setState(prev => ({ ...prev, isRecording: true, error: null, recordingDuration: 0 }));
    recordingStartRef.current = Date.now();

    // Start duration timer (never leak a previous one)
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    durationIntervalRef.current = setInterval(() => {
      setState(prev => ({
        ...prev,
        recordingDuration: Date.now() - recordingStartRef.current,
      }));
    }, 100);

    try {
      const result = await window.electronAPI.startMethodTrace(device.id, packageName);
      if (generation !== targetGenerationRef.current) return;

      if (!result.success) {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        setState(prev => ({
          ...prev,
          isRecording: false,
          error: result.error || 'Failed to start method trace',
        }));
      }
    } catch (error) {
      if (generation !== targetGenerationRef.current) return;
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      setState(prev => ({
        ...prev,
        isRecording: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [device, packageName]);

  const analyzeTrace = useCallback(async (trace: MethodTraceInfo) => {
    if (!trace.filePath || trace.status !== 'ready') {
      return;
    }

    analyzingTraceIdRef.current = trace.id;
    setState(prev => ({ ...prev, isAnalyzing: true, selectedTrace: trace, analysis: null }));

    try {
      const analysis = await window.electronAPI.analyzeMethodTrace(trace.filePath);
      if (analyzingTraceIdRef.current !== trace.id) return;
      setState(prev => ({
        ...prev,
        analysis,
        isAnalyzing: false,
        error: analysis ? null : 'Failed to analyze method trace',
      }));
    } catch (error) {
      if (analyzingTraceIdRef.current !== trace.id) return;
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!device || !packageName) return;

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    setState(prev => ({ ...prev, isRecording: false }));

    try {
      const traceInfo = await window.electronAPI.stopMethodTrace(device.id, packageName);

      if (traceInfo.status === 'error') {
        setState(prev => ({
          ...prev,
          error: traceInfo.error || 'Failed to stop method trace',
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        traces: [traceInfo, ...prev.traces],
        selectedTrace: traceInfo,
      }));

      // Auto-analyze the trace
      analyzeTrace(traceInfo);
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [device, packageName, analyzeTrace]);

  const selectTrace = useCallback((trace: MethodTraceInfo) => {
    setState(prev => ({ ...prev, selectedTrace: trace }));
    analyzeTrace(trace);
  }, [analyzeTrace]);

  const clearTraces = useCallback(() => {
    analyzingTraceIdRef.current = null;
    // Clearing the list must not abandon an active recording: its timer and
    // device-side trace keep running, so keep the recording state intact.
    setState(prev => ({
      ...prev,
      traces: [],
      selectedTrace: null,
      analysis: null,
      isAnalyzing: false,
      error: null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    selectTrace,
    clearTraces,
    clearError,
  };
}
