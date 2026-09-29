import { useState, useEffect, useCallback } from 'react';
import type { Device, ScrcpyConfig, ScrcpyState } from '@android-debugger/shared';
import type { MirrorServerStatus } from '../lib/mirror/types';

interface ScrcpyDownloadProgress {
  percent: number;
  message: string;
}

interface UseScreenMirrorReturn {
  /** The separate scrcpy window is open for this device. */
  isWindowOpen: boolean;
  /** scrcpy binary found (needed for the separate window). */
  scrcpyAvailable: boolean | null;
  /** Server jar found (needed for in-app mirroring). null while checking. */
  serverStatus: MirrorServerStatus | null;
  needsDownload: boolean;
  isDownloading: boolean;
  downloadProgress: ScrcpyDownloadProgress | null;
  windowError: string | null;
  scrcpyInfo: { path: string; version: string } | null;

  downloadScrcpy: () => Promise<boolean>;
  openWindow: (config: ScrcpyConfig) => Promise<void>;
  closeWindow: () => Promise<void>;
  checkEnvironment: () => Promise<void>;
}

/**
 * scrcpy installation state and the "open in a separate window" mode. The
 * in-app mirror session lives in lib/mirror/mirror-client (it can outlive
 * the panel when pinned).
 */
export function useScreenMirror(device: Device | null): UseScreenMirrorReturn {
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [scrcpyAvailable, setScrcpyAvailable] = useState<boolean | null>(null);
  const [serverStatus, setServerStatus] = useState<MirrorServerStatus | null>(null);
  const [needsDownload, setNeedsDownload] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ScrcpyDownloadProgress | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [scrcpyInfo, setScrcpyInfo] = useState<{ path: string; version: string } | null>(null);

  const checkEnvironment = useCallback(async () => {
    try {
      const [available, needs, info, state, server] = await Promise.all([
        window.electronAPI.checkScrcpy(),
        window.electronAPI.needsScrcpyDownload(),
        window.electronAPI.getScrcpyInfo(),
        window.electronAPI.getScrcpyState(),
        window.electronAPI.getMirrorServerStatus(),
      ]);
      setScrcpyAvailable(available);
      setNeedsDownload(needs && !server.available);
      setScrcpyInfo(info);
      setServerStatus(server);
      setIsWindowOpen(state.isRunning && state.deviceId === device?.id);
    } catch (err) {
      console.error('Error checking scrcpy environment:', err);
      setServerStatus({ available: false, version: null, path: null });
    }
  }, [device?.id]);

  const downloadScrcpy = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress({ percent: 0, message: 'Starting download…' });
    setWindowError(null);
    try {
      const result = await window.electronAPI.downloadScrcpy();
      if (result.success) {
        setDownloadProgress({ percent: 100, message: 'Download complete' });
        await checkEnvironment();
        return true;
      }
      setWindowError(result.error || 'Download failed');
      setDownloadProgress(null);
      return false;
    } catch (err) {
      setWindowError(err instanceof Error ? err.message : 'Download failed');
      setDownloadProgress(null);
      return false;
    } finally {
      setIsDownloading(false);
    }
  }, [checkEnvironment]);

  const openWindow = useCallback(
    async (config: ScrcpyConfig) => {
      if (!device) return;
      setWindowError(null);
      try {
        const result = await window.electronAPI.startMirror(device.id, config);
        if (!result.success) setWindowError(result.error || 'Could not open the scrcpy window');
      } catch (err) {
        setWindowError(err instanceof Error ? err.message : 'Could not open the scrcpy window');
      }
    },
    [device]
  );

  const closeWindow = useCallback(async () => {
    try {
      await window.electronAPI.stopMirror();
    } catch (err) {
      setWindowError(err instanceof Error ? err.message : 'Could not close the scrcpy window');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onScrcpyDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribeStarted = window.electronAPI.onMirrorStarted((state: ScrcpyState) => {
      if (state.deviceId === device?.id) {
        setIsWindowOpen(true);
        setWindowError(null);
      }
    });
    const unsubscribeStopped = window.electronAPI.onMirrorStopped(() => setIsWindowOpen(false));
    const unsubscribeError = window.electronAPI.onMirrorError((errorMsg: string) => {
      setIsWindowOpen(false);
      setWindowError(errorMsg);
    });
    return () => {
      unsubscribeStarted();
      unsubscribeStopped();
      unsubscribeError();
    };
  }, [device?.id]);

  useEffect(() => {
    setWindowError(null);
    void checkEnvironment();
  }, [checkEnvironment]);

  return {
    isWindowOpen,
    scrcpyAvailable,
    serverStatus,
    needsDownload,
    isDownloading,
    downloadProgress,
    windowError,
    scrcpyInfo,
    downloadScrcpy,
    openWindow,
    closeWindow,
    checkEnvironment,
  };
}
