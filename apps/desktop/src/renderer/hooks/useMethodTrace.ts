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

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!device || !packageName) {
      setState(prev => ({ ...prev, error: 'No device or package selected' }));
      return;
    }

    setState(prev => ({ ...prev, isRecording: true, error: null, recordingDuration: 0 }));
    recordingStartRef.current = Date.now();

    // Start duration timer
    durationIntervalRef.current = setInterval(() => {
      setState(prev => ({
        ...prev,
        recordingDuration: Date.now() - recordingStartRef.current,
      }));
    }, 100);

    try {
      const result = await window.electronAPI.startMethodTrace(device.id, packageName);

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
  }, [device, packageName]);

  const analyzeTrace = useCallback(async (trace: MethodTraceInfo) => {
    if (!trace.filePath || trace.status !== 'ready') {
      return;
    }

    setState(prev => ({ ...prev, isAnalyzing: true, selectedTrace: trace, analysis: null }));

    try {
      const analysis = await window.electronAPI.analyzeMethodTrace(trace.filePath);
      setState(prev => ({
        ...prev,
        analysis,
        isAnalyzing: false,
        error: analysis ? null : 'Failed to analyze method trace',
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  const selectTrace = useCallback((trace: MethodTraceInfo) => {
    setState(prev => ({ ...prev, selectedTrace: trace }));
    analyzeTrace(trace);
  }, [analyzeTrace]);

  const clearTraces = useCallback(() => {
    setState({
      traces: [],
      selectedTrace: null,
      analysis: null,
      isRecording: false,
      isAnalyzing: false,
      recordingDuration: 0,
      error: null,
    });
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
