import { useState, useCallback } from 'react';
import type { BundleAnalysis } from '@android-debugger/shared';

interface UseBundleAnalyzerReturn {
  analysis: BundleAnalysis | null;
  isAnalyzing: boolean;
  error: string | null;
  selectAndAnalyze: () => Promise<void>;
  analyzeFile: (filePath: string) => Promise<void>;
  analyzeDroppedFile: (file: File) => Promise<void>;
  reset: () => void;
}

export function useBundleAnalyzer(): UseBundleAnalyzerReturn {
  const [analysis, setAnalysis] = useState<BundleAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeFile = useCallback(async (filePath: string) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await window.electronAPI.analyzeBundle(filePath);
      if (result.success && result.analysis) {
        setAnalysis(result.analysis);
      } else {
        setAnalysis(null);
        setError(result.error || 'Failed to analyze bundle');
      }
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : 'Failed to analyze bundle');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const selectAndAnalyze = useCallback(async () => {
    try {
      const file = await window.electronAPI.selectAppFile();
      if (file) {
        await analyzeFile(file.filePath);
      }
    } catch (err) {
      console.error('Error selecting file:', err);
    }
  }, [analyzeFile]);

  const analyzeDroppedFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.apk') && !name.endsWith('.aab')) {
      setError('Only .apk and .aab files can be analyzed');
      return;
    }
    const filePath = window.electronAPI.getPathForFile(file);
    if (!filePath) {
      setError('Could not resolve the dropped file path');
      return;
    }
    await analyzeFile(filePath);
  }, [analyzeFile]);

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
    setIsAnalyzing(false);
  }, []);

  return {
    analysis,
    isAnalyzing,
    error,
    selectAndAnalyze,
    analyzeFile,
    analyzeDroppedFile,
    reset,
  };
}
