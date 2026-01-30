import { useState, useCallback } from 'react';
import type { HeapDumpInfo, HeapAnalysis, HeapClass, Device } from '@android-debugger/shared';

export interface HeapDumpState {
  dumps: HeapDumpInfo[];
  selectedDump: HeapDumpInfo | null;
  analysis: HeapAnalysis | null;
  selectedClass: HeapClass | null;
  isCapturing: boolean;
  isAnalyzing: boolean;
  error: string | null;
}

export function useHeapDump(device: Device | null, packageName: string) {
  const [state, setState] = useState<HeapDumpState>({
    dumps: [],
    selectedDump: null,
    analysis: null,
    selectedClass: null,
    isCapturing: false,
    isAnalyzing: false,
    error: null,
  });

  const captureDump = useCallback(async () => {
    if (!device || !packageName) {
      setState(prev => ({ ...prev, error: 'No device or package selected' }));
      return;
    }

    setState(prev => ({ ...prev, isCapturing: true, error: null }));

    try {
      const dumpInfo = await window.electronAPI.captureHeapDump(device.id, packageName);

      if (dumpInfo.status === 'error') {
        setState(prev => ({
          ...prev,
          isCapturing: false,
          error: dumpInfo.error || 'Failed to capture heap dump',
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        dumps: [dumpInfo, ...prev.dumps],
        selectedDump: dumpInfo,
        isCapturing: false,
      }));

      // Auto-analyze the dump
      analyzeDump(dumpInfo);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isCapturing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [device, packageName]);

  const analyzeDump = useCallback(async (dump: HeapDumpInfo) => {
    if (!dump.filePath || dump.status !== 'ready') {
      return;
    }

    setState(prev => ({ ...prev, isAnalyzing: true, selectedDump: dump, analysis: null }));

    try {
      const analysis = await window.electronAPI.analyzeHeapDump(dump.filePath);
      setState(prev => ({
        ...prev,
        analysis,
        isAnalyzing: false,
        error: analysis ? null : 'Failed to analyze heap dump',
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  const selectDump = useCallback((dump: HeapDumpInfo) => {
    setState(prev => ({ ...prev, selectedDump: dump, selectedClass: null }));
    analyzeDump(dump);
  }, [analyzeDump]);

  const selectClass = useCallback((heapClass: HeapClass | null) => {
    setState(prev => ({ ...prev, selectedClass: heapClass }));
  }, []);

  const clearDumps = useCallback(() => {
    setState({
      dumps: [],
      selectedDump: null,
      analysis: null,
      selectedClass: null,
      isCapturing: false,
      isAnalyzing: false,
      error: null,
    });
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    captureDump,
    selectDump,
    selectClass,
    clearDumps,
    clearError,
  };
}
