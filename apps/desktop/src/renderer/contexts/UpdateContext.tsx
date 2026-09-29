import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { UpdateInfo, UpdateProgress } from '@android-debugger/shared';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

interface UpdateContextType {
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  updateProgress: UpdateProgress | null;
  updateError: string | null;
  showModal: boolean;
  dismissModal: () => void;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  navigateToSettings: (() => void) | null;
  setNavigateToSettings: (fn: () => void) => void;
}

const UpdateContext = createContext<UpdateContextType | null>(null);

interface UpdateProviderProps {
  children: ReactNode;
}

export function UpdateProvider({ children }: UpdateProviderProps) {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [navigateToSettings, setNavigateToSettingsFn] = useState<(() => void) | null>(null);

  // Set up update event listeners
  useEffect(() => {
    const unsubChecking = window.electronAPI.onUpdateChecking(() => {
      setUpdateStatus('checking');
      setUpdateError(null);
    });

    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateStatus('available');
      setUpdateInfo(info);
      // Show modal only if this version wasn't dismissed in this session
      if (info.version !== dismissedVersion) {
        setShowModal(true);
      }
    });

    const unsubNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateStatus('idle');
      setUpdateInfo(null);
      setShowModal(false);
    });

    const unsubProgress = window.electronAPI.onUpdateProgress((progress) => {
      setUpdateStatus('downloading');
      setUpdateProgress(progress);
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateStatus('downloaded');
      setUpdateInfo(info);
      setUpdateProgress(null);
    });

    const unsubError = window.electronAPI.onUpdateError((error) => {
      setUpdateStatus('error');
      setUpdateError(error);
      setShowModal(false);
    });

    return () => {
      unsubChecking();
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, [dismissedVersion]);

  const dismissModal = useCallback(() => {
    setShowModal(false);
    if (updateInfo?.version) {
      setDismissedVersion(updateInfo.version);
    }
  }, [updateInfo?.version]);

  const checkForUpdates = useCallback(async () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const result = await window.electronAPI.checkForUpdates();
      // Events normally drive the status, but don't leave the UI stuck in
      // 'checking' if the check failed without emitting an error event.
      if (result.error) {
        setUpdateStatus('error');
        setUpdateError(result.error);
      } else if (!result.updateAvailable) {
        setUpdateStatus((prev) => (prev === 'checking' ? 'idle' : prev));
      }
    } catch (error) {
      setUpdateStatus('error');
      setUpdateError(error instanceof Error ? error.message : 'Failed to check for updates');
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    // Show progress immediately; progress events may take a moment to arrive.
    setUpdateStatus('downloading');
    setUpdateError(null);
    try {
      const result = await window.electronAPI.downloadUpdate();
      if (!result.success) {
        setUpdateStatus('error');
        setUpdateError(result.error || 'Failed to download update');
      }
    } catch (error) {
      setUpdateStatus('error');
      setUpdateError(error instanceof Error ? error.message : 'Failed to download update');
    }
  }, []);

  const installUpdate = useCallback(async () => {
    await window.electronAPI.installUpdate();
  }, []);

  const setNavigateToSettings = useCallback((fn: () => void) => {
    setNavigateToSettingsFn(() => fn);
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        updateStatus,
        updateInfo,
        updateProgress,
        updateError,
        showModal,
        dismissModal,
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        navigateToSettings,
        setNavigateToSettings,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdateContext() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdateContext must be used within an UpdateProvider');
  }
  return context;
}
