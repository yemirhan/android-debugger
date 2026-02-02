import { useState, useEffect, useCallback } from 'react';
import type { Device, ScrcpyConfig, ScrcpyState } from '@android-debugger/shared';

interface ScrcpyDownloadProgress {
  percent: number;
  message: string;
}

interface UseScreenMirrorReturn {
  // State
  isMirroring: boolean;
  scrcpyAvailable: boolean | null;
  needsDownload: boolean;
  isDownloading: boolean;
  downloadProgress: ScrcpyDownloadProgress | null;
  error: string | null;
  scrcpyInfo: { path: string; version: string } | null;

  // Config
  config: ScrcpyConfig;
  setConfig: (config: ScrcpyConfig) => void;

  // Actions
  downloadScrcpy: () => Promise<void>;
  startMirror: () => Promise<void>;
  stopMirror: () => Promise<void>;
  checkEnvironment: () => Promise<void>;
}

const DEFAULT_CONFIG: ScrcpyConfig = {
  showTouches: false,
  stayAwake: true,
  turnScreenOff: false,
  alwaysOnTop: false,
};

export function useScreenMirror(device: Device | null): UseScreenMirrorReturn {
  // State
  const [isMirroring, setIsMirroring] = useState(false);
  const [scrcpyAvailable, setScrcpyAvailable] = useState<boolean | null>(null);
  const [needsDownload, setNeedsDownload] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ScrcpyDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrcpyInfo, setScrcpyInfo] = useState<{ path: string; version: string } | null>(null);

  // Config
  const [config, setConfig] = useState<ScrcpyConfig>(DEFAULT_CONFIG);

  // Check environment (scrcpy availability)
  const checkEnvironment = useCallback(async () => {
    try {
      const [available, needs, info, state] = await Promise.all([
        window.electronAPI.checkScrcpy(),
        window.electronAPI.needsScrcpyDownload(),
        window.electronAPI.getScrcpyInfo(),
        window.electronAPI.getScrcpyState(),
      ]);
      setScrcpyAvailable(available);
      setNeedsDownload(needs);
      setScrcpyInfo(info);
      setIsMirroring(state.isRunning && state.deviceId === device?.id);
    } catch (err) {
      console.error('Error checking scrcpy environment:', err);
    }
  }, [device?.id]);

  // Download scrcpy
  const downloadScrcpy = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress({ percent: 0, message: 'Starting download...' });
    setError(null);

    try {
      const result = await window.electronAPI.downloadScrcpy();
      if (result.success) {
        setScrcpyAvailable(true);
        setNeedsDownload(false);
        setDownloadProgress({ percent: 100, message: 'Download complete!' });
        // Refresh info
        const info = await window.electronAPI.getScrcpyInfo();
        setScrcpyInfo(info);
      } else {
        setError(result.error || 'Download failed');
        setDownloadProgress({ percent: 0, message: result.error || 'Download failed' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setDownloadProgress({ percent: 0, message });
    } finally {
      setIsDownloading(false);
    }
  }, []);

  // Start mirroring
  const startMirror = useCallback(async () => {
    if (!device) {
      setError('No device selected');
      return;
    }

    setError(null);

    try {
      const result = await window.electronAPI.startMirror(device.id, config);
      if (!result.success) {
        setError(result.error || 'Failed to start mirroring');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    }
  }, [device, config]);

  // Stop mirroring
  const stopMirror = useCallback(async () => {
    try {
      await window.electronAPI.stopMirror();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    }
  }, []);

  // Listen for download progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.onScrcpyDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });
    return () => unsubscribe();
  }, []);

  // Listen for mirror state changes
  useEffect(() => {
    const unsubscribeStarted = window.electronAPI.onMirrorStarted((state: ScrcpyState) => {
      if (state.deviceId === device?.id) {
        setIsMirroring(true);
        setError(null);
      }
    });

    const unsubscribeStopped = window.electronAPI.onMirrorStopped(() => {
      setIsMirroring(false);
    });

    const unsubscribeError = window.electronAPI.onMirrorError((errorMsg: string) => {
      setIsMirroring(false);
      setError(errorMsg);
    });

    return () => {
      unsubscribeStarted();
      unsubscribeStopped();
      unsubscribeError();
    };
  }, [device?.id]);

  // Check environment when device changes
  useEffect(() => {
    checkEnvironment();
  }, [device?.id]);

  // Reset state when device changes
  useEffect(() => {
    setError(null);
  }, [device?.id]);

  return {
    // State
    isMirroring,
    scrcpyAvailable,
    needsDownload,
    isDownloading,
    downloadProgress,
    error,
    scrcpyInfo,

    // Config
    config,
    setConfig,

    // Actions
    downloadScrcpy,
    startMirror,
    stopMirror,
    checkEnvironment,
  };
}
