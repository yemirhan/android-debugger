import React from 'react';
import { useUpdateContext } from '../contexts/UpdateContext';

export function UpdateAvailableModal() {
  const {
    updateStatus,
    updateInfo,
    updateProgress,
    showModal,
    dismissModal,
    downloadUpdate,
    navigateToSettings,
  } = useUpdateContext();

  if (!showModal || updateStatus !== 'available' || !updateInfo) {
    return null;
  }

  const handleViewInSettings = () => {
    dismissModal();
    navigateToSettings?.();
  };

  const handleDownload = async () => {
    dismissModal();
    await downloadUpdate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismissModal}
      />

      {/* Modal */}
      <div className="relative bg-surface border border-border-muted rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-6 h-6 text-accent"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-text-primary">
                Update Available
              </h2>
              <p className="text-sm text-text-secondary mt-1">
                Version {updateInfo.version} is ready to download
              </p>
            </div>
            <button
              onClick={dismissModal}
              className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Release Notes */}
        {updateInfo.releaseNotes && (
          <div className="px-6 pb-4">
            <div className="bg-background rounded-lg p-4 max-h-40 overflow-y-auto">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                What's New
              </h3>
              <div
                className="text-sm text-text-secondary [&_p]:mb-2 [&_p:last-child]:mb-0 [&_br]:hidden"
                dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={dismissModal}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-text-secondary bg-surface-hover hover:bg-border-muted rounded-lg transition-colors"
          >
            Remind Me Later
          </button>
          <button
            onClick={handleViewInSettings}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-text-primary bg-surface-hover hover:bg-border-muted border border-border-muted rounded-lg transition-colors"
          >
            View in Settings
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-lg transition-colors"
          >
            Download Now
          </button>
        </div>
      </div>
    </div>
  );
}
