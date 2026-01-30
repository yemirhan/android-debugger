import { useState, useEffect, useCallback } from 'react';
import type {
  Device,
  InstallOptions,
  InstallProgress,
  InstallResult,
  SelectedAppFile,
  DeviceSpec,
  InstallStage,
} from '@android-debugger/shared';

interface BundletoolDownloadProgress {
  percent: number;
  message: string;
}

interface UseAppInstallerReturn {
  // File selection
  selectedFile: SelectedAppFile | null;
  selectFile: () => Promise<void>;
  clearFile: () => void;

  // Installation
  installOptions: InstallOptions;
  setInstallOptions: (options: InstallOptions) => void;
  install: () => Promise<void>;

  // Progress & Result
  progress: InstallProgress | null;
  result: InstallResult | null;
  isInstalling: boolean;

  // Environment checks
  javaAvailable: boolean | null;
  bundletoolAvailable: boolean | null;
  needsBundletoolDownload: boolean;
  isDownloadingBundletool: boolean;
  bundletoolDownloadProgress: BundletoolDownloadProgress | null;
  downloadBundletool: () => Promise<void>;
  deviceSpec: DeviceSpec | null;
  checkEnvironment: () => Promise<void>;

  // Reset
  reset: () => void;
}

export function useAppInstaller(device: Device | null): UseAppInstallerReturn {
  // File selection state
  const [selectedFile, setSelectedFile] = useState<SelectedAppFile | null>(null);

  // Installation options
  const [installOptions, setInstallOptions] = useState<InstallOptions>({
    reinstall: true,
    allowDowngrade: false,
    grantPermissions: true,
  });

  // Progress and result
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  // Environment checks
  const [javaAvailable, setJavaAvailable] = useState<boolean | null>(null);
  const [bundletoolAvailable, setBundletoolAvailable] = useState<boolean | null>(null);
  const [needsBundletoolDownload, setNeedsBundletoolDownload] = useState<boolean>(false);
  const [isDownloadingBundletool, setIsDownloadingBundletool] = useState<boolean>(false);
  const [bundletoolDownloadProgress, setBundletoolDownloadProgress] = useState<BundletoolDownloadProgress | null>(null);
  const [deviceSpec, setDeviceSpec] = useState<DeviceSpec | null>(null);

  // Select file via dialog
  const selectFile = useCallback(async () => {
    try {
      const file = await window.electronAPI.selectAppFile();
      if (file) {
        setSelectedFile(file);
        setResult(null);
        setProgress(null);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
    }
  }, []);

  // Clear selected file
  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setResult(null);
    setProgress(null);
  }, []);

  // Check environment (Java, bundletool, device spec)
  const checkEnvironment = useCallback(async () => {
    try {
      const [java, bundletool, needsDownload] = await Promise.all([
        window.electronAPI.checkJava(),
        window.electronAPI.checkBundletool(),
        window.electronAPI.needsBundletoolDownload(),
      ]);
      setJavaAvailable(java);
      setBundletoolAvailable(bundletool);
      setNeedsBundletoolDownload(needsDownload);

      if (device) {
        const spec = await window.electronAPI.getDeviceSpec(device.id);
        setDeviceSpec(spec);
      }
    } catch (error) {
      console.error('Error checking environment:', error);
    }
  }, [device]);

  // Download bundletool
  const downloadBundletool = useCallback(async () => {
    setIsDownloadingBundletool(true);
    setBundletoolDownloadProgress({ percent: 0, message: 'Starting download...' });

    try {
      const result = await window.electronAPI.downloadBundletool();
      if (result.success) {
        setBundletoolAvailable(true);
        setNeedsBundletoolDownload(false);
        setBundletoolDownloadProgress({ percent: 100, message: 'Download complete!' });
      } else {
        setBundletoolDownloadProgress({ percent: 0, message: result.error || 'Download failed' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setBundletoolDownloadProgress({ percent: 0, message });
    } finally {
      setIsDownloadingBundletool(false);
    }
  }, []);

  // Install the selected app
  const install = useCallback(async () => {
    if (!device || !selectedFile) return;

    setIsInstalling(true);
    setResult(null);
    setProgress({ stage: 'validating', percent: 0, message: 'Starting installation...' });

    try {
      const installResult = await window.electronAPI.installApp(
        device.id,
        selectedFile.filePath,
        installOptions
      );
      setResult(installResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setResult({ success: false, error: message, errorCode: 'UNKNOWN' });
    } finally {
      setIsInstalling(false);
    }
  }, [device, selectedFile, installOptions]);

  // Reset all state
  const reset = useCallback(() => {
    setSelectedFile(null);
    setProgress(null);
    setResult(null);
    setIsInstalling(false);
  }, []);

  // Listen for progress updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onInstallProgress((progressUpdate: InstallProgress) => {
      setProgress(progressUpdate);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Listen for bundletool download progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.onBundletoolDownloadProgress((progressUpdate) => {
      setBundletoolDownloadProgress(progressUpdate);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Check environment when device changes
  useEffect(() => {
    if (device) {
      checkEnvironment();
    }
  }, [device?.id]);

  // Reset when device changes
  useEffect(() => {
    reset();
  }, [device?.id]);

  return {
    // File selection
    selectedFile,
    selectFile,
    clearFile,

    // Installation
    installOptions,
    setInstallOptions,
    install,

    // Progress & Result
    progress,
    result,
    isInstalling,

    // Environment checks
    javaAvailable,
    bundletoolAvailable,
    needsBundletoolDownload,
    isDownloadingBundletool,
    bundletoolDownloadProgress,
    downloadBundletool,
    deviceSpec,
    checkEnvironment,

    // Reset
    reset,
  };
}
