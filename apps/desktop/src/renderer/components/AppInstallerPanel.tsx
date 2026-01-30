import React, { useState, useCallback, DragEvent } from 'react';
import type { Device, InstallStage } from '@android-debugger/shared';
import { useAppInstaller } from '../hooks/useAppInstaller';

interface AppInstallerPanelProps {
  device: Device;
}

export function AppInstallerPanel({ device }: AppInstallerPanelProps) {
  const {
    selectedFile,
    selectFile,
    clearFile,
    installOptions,
    setInstallOptions,
    install,
    progress,
    result,
    isInstalling,
    javaAvailable,
    bundletoolAvailable,
    needsBundletoolDownload,
    isDownloadingBundletool,
    bundletoolDownloadProgress,
    downloadBundletool,
    deviceSpec,
    reset,
  } = useAppInstaller(device);

  const [isDragOver, setIsDragOver] = useState(false);

  // Handle drag and drop
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Note: Due to Electron security restrictions, we can't directly access
    // dropped files. The user should use the browse button instead.
    // In a future enhancement, we could use IPC to handle dropped files.
    selectFile();
  }, [selectFile]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get progress stage label
  const getStageLabel = (stage: InstallStage): string => {
    switch (stage) {
      case 'idle':
        return 'Ready';
      case 'validating':
        return 'Validating...';
      case 'extracting':
        return 'Extracting APKs...';
      case 'pushing':
        return 'Pushing to device...';
      case 'installing':
        return 'Installing...';
      case 'complete':
        return 'Complete!';
      case 'error':
        return 'Error';
      default:
        return 'Processing...';
    }
  };

  // Get progress bar color
  const getProgressColor = (stage: InstallStage): string => {
    switch (stage) {
      case 'complete':
        return 'bg-emerald-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-accent';
    }
  };

  // Check if AAB and Java is missing
  const showJavaWarning = selectedFile?.fileType === 'aab' && javaAvailable === false;
  const showBundletoolWarning = selectedFile?.fileType === 'aab' && bundletoolAvailable === false;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Install App</h2>
        {deviceSpec && (
          <div className="text-xs text-text-muted">
            SDK {deviceSpec.sdkVersion} | {deviceSpec.abis[0] || 'Unknown ABI'}
          </div>
        )}
      </div>

      {/* File Selection Zone */}
      {!selectedFile && !result && (
        <div
          onClick={selectFile}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            bg-surface rounded-lg p-8 border-2 border-dashed transition-all cursor-pointer
            ${isDragOver
              ? 'border-accent bg-accent/10'
              : 'border-border-muted hover:border-text-muted hover:bg-surface-hover'
            }
          `}
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
              <UploadIcon />
            </div>
            <p className="text-sm font-medium text-text-primary mb-1">
              Drop APK or AAB file here
            </p>
            <p className="text-xs text-text-muted mb-4">
              or click to browse
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                selectFile();
              }}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-md transition-all duration-150 btn-press"
            >
              Browse Files
            </button>
          </div>
        </div>
      )}

      {/* Selected File Info */}
      {selectedFile && !result && (
        <div className="bg-surface rounded-lg p-4 border border-border-muted">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
              {selectedFile.fileType === 'aab' ? <AabIcon /> : <ApkIcon />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {selectedFile.fileName}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-text-muted">
                  {formatSize(selectedFile.fileSize)}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  selectedFile.fileType === 'aab'
                    ? 'bg-purple-500/15 text-purple-400'
                    : 'bg-emerald-500/15 text-emerald-400'
                }`}>
                  {selectedFile.fileType.toUpperCase()}
                </span>
              </div>
            </div>
            <button
              onClick={clearFile}
              className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              title="Remove file"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}

      {/* Java Warning for AAB */}
      {showJavaWarning && (
        <div className="px-4 py-3 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-start gap-3">
          <WarningIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Java Required</p>
            <p className="text-xs mt-0.5 opacity-80">
              AAB files require Java to be installed. Please install Java or use an APK file instead.
            </p>
          </div>
        </div>
      )}

      {/* Bundletool Download */}
      {showBundletoolWarning && (
        <div className="px-4 py-3 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400">
          <div className="flex items-start gap-3">
            <DownloadIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Bundletool Required</p>
              <p className="text-xs mt-0.5 opacity-80">
                AAB files require bundletool. Click to download it (~18MB).
              </p>
              {isDownloadingBundletool && bundletoolDownloadProgress && (
                <div className="mt-3">
                  <div className="h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-300"
                      style={{ width: `${bundletoolDownloadProgress.percent}%` }}
                    />
                  </div>
                  <p className="text-xs mt-1 opacity-70">{bundletoolDownloadProgress.message}</p>
                </div>
              )}
              {!isDownloadingBundletool && (
                <button
                  onClick={downloadBundletool}
                  className="mt-2 px-3 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded transition-colors"
                >
                  Download Bundletool
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Install Options */}
      {selectedFile && !result && (
        <div className="bg-surface rounded-lg p-4 border border-border-muted">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Install Options
          </h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={installOptions.reinstall ?? true}
                onChange={(e) =>
                  setInstallOptions({ ...installOptions, reinstall: e.target.checked })
                }
                className="w-4 h-4 rounded border-border-muted bg-surface-hover text-accent focus:ring-accent focus:ring-offset-0"
              />
              <div>
                <span className="text-sm text-text-primary">Reinstall</span>
                <p className="text-xs text-text-muted">Replace existing app if installed</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={installOptions.allowDowngrade ?? false}
                onChange={(e) =>
                  setInstallOptions({ ...installOptions, allowDowngrade: e.target.checked })
                }
                className="w-4 h-4 rounded border-border-muted bg-surface-hover text-accent focus:ring-accent focus:ring-offset-0"
              />
              <div>
                <span className="text-sm text-text-primary">Allow Downgrade</span>
                <p className="text-xs text-text-muted">Allow installing older versions</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={installOptions.grantPermissions ?? true}
                onChange={(e) =>
                  setInstallOptions({ ...installOptions, grantPermissions: e.target.checked })
                }
                className="w-4 h-4 rounded border-border-muted bg-surface-hover text-accent focus:ring-accent focus:ring-offset-0"
              />
              <div>
                <span className="text-sm text-text-primary">Grant Permissions</span>
                <p className="text-xs text-text-muted">Auto-grant all runtime permissions</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Install Button */}
      {selectedFile && !result && (
        <button
          onClick={install}
          disabled={isInstalling || showJavaWarning || showBundletoolWarning || isDownloadingBundletool}
          className="w-full px-4 py-3 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-lg transition-all duration-150 btn-press disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isInstalling ? (
            <>
              <Spinner />
              Installing...
            </>
          ) : (
            <>
              <InstallIcon />
              Install to Device
            </>
          )}
        </button>
      )}

      {/* Progress Bar */}
      {isInstalling && progress && (
        <div className="bg-surface rounded-lg p-4 border border-border-muted">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-primary">
              {getStageLabel(progress.stage)}
            </span>
            <span className="text-xs text-text-muted">{progress.percent}%</span>
          </div>
          <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${getProgressColor(progress.stage)}`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {progress.message && (
            <p className="text-xs text-text-muted mt-2">{progress.message}</p>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg p-4 border ${
            result.success
              ? 'bg-emerald-500/10 border-emerald-500/25'
              : 'bg-red-500/10 border-red-500/25'
          }`}
        >
          <div className="flex items-start gap-3">
            {result.success ? (
              <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <CheckIcon className="w-5 h-5 text-emerald-400" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <ErrorIcon className="w-5 h-5 text-red-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${
                  result.success ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {result.success ? 'Installation Successful!' : 'Installation Failed'}
              </p>
              {result.success && result.packageName && (
                <p className="text-xs text-text-muted mt-0.5 font-mono">
                  {result.packageName}
                </p>
              )}
              {!result.success && result.error && (
                <p className="text-xs text-red-400/80 mt-1">{result.error}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Install Another Button */}
      {result && (
        <button
          onClick={reset}
          className="w-full px-4 py-3 text-sm font-medium bg-surface-hover hover:bg-surface border border-border-muted text-text-primary rounded-lg transition-all duration-150 btn-press flex items-center justify-center gap-2"
        >
          <UploadIcon className="w-4 h-4" />
          Install Another App
        </button>
      )}

      {/* Tips */}
      <div className="bg-surface rounded-lg p-4 border border-border-muted mt-auto">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
          Tips
        </h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-accent">*</span>
            APK files install directly via ADB
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">*</span>
            AAB files are converted to device-specific APKs using bundletool
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">*</span>
            Enable "Reinstall" to update existing apps
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">*</span>
            "Allow Downgrade" lets you install older versions
          </li>
        </ul>
      </div>
    </div>
  );
}

// Icons

const UploadIcon = ({ className = 'w-8 h-8' }: { className?: string }) => (
  <svg className={`${className} text-text-muted`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
    />
  </svg>
);

const ApkIcon = () => (
  <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm7 3l-5 5h3v5h4v-5h3l-5-5z" />
  </svg>
);

const AabIcon = () => (
  <svg className="w-6 h-6 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm3 4v10h2V7H8zm6 0v10h2V7h-2zm-3 2v6h2V9h-2z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const InstallIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const ErrorIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const WarningIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);
