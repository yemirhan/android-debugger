import { useState, useEffect, useCallback } from 'react';
import type { Device, ScreenshotResult, RecordingState } from '@android-debugger/shared';

export function useScreenCapture(device: Device | null) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [lastScreenshot, setLastScreenshot] = useState<ScreenshotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for recording state updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onRecordingUpdate((state: RecordingState) => {
      setIsRecording(state.isRecording);
      setRecordingPath(state.outputPath || null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const takeScreenshot = useCallback(async () => {
    if (!device) {
      setError('No device connected');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.takeScreenshot(device.id);
      if (result) {
        setLastScreenshot(result);
      } else {
        setError('Screenshot cancelled or failed');
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [device]);

  const startRecording = useCallback(async () => {
    if (!device) {
      setError('No device connected');
      return false;
    }

    if (isRecording) {
      setError('Already recording');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.startScreenRecording(device.id);
      if (result.success) {
        setIsRecording(true);
        setRecordingPath(result.path || null);
      } else {
        setError('Failed to start recording');
      }
      return result.success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [device, isRecording]);

  const stopRecording = useCallback(async () => {
    if (!device) {
      setError('No device connected');
      return null;
    }

    if (!isRecording) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.stopScreenRecording(device.id);
      setIsRecording(false);
      if (result.success) {
        return result.path || null;
      } else {
        setError('Failed to stop recording');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
      setRecordingPath(null);
    }
  }, [device, isRecording]);

  return {
    isRecording,
    recordingPath,
    lastScreenshot,
    loading,
    error,
    takeScreenshot,
    startRecording,
    stopRecording,
  };
}
