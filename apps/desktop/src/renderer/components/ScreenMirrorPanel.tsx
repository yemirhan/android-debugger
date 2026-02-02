import React, { useState } from 'react';
import type { Device } from '@android-debugger/shared';
import { useScreenMirror } from '../hooks/useScreenMirror';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface ScreenMirrorPanelProps {
  device: Device;
}

export function ScreenMirrorPanel({ device }: ScreenMirrorPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const {
    isMirroring,
    scrcpyAvailable,
    needsDownload,
    isDownloading,
    downloadProgress,
    error,
    scrcpyInfo,
    config,
    setConfig,
    downloadScrcpy,
    startMirror,
    stopMirror,
  } = useScreenMirror(device);

  const guide = tabGuides['screen-mirror'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide?.title || 'Screen Mirror'}
        description={guide?.description || 'Mirror your device screen'}
        features={guide?.features}
        tips={guide?.tips}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Screen Mirror</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
        </div>
        {scrcpyInfo && (
          <div className="text-xs text-text-muted">
            scrcpy v{scrcpyInfo.version}
          </div>
        )}
      </div>

      {/* scrcpy Download Prompt */}
      {needsDownload && (
        <div className="px-4 py-3 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400">
          <div className="flex items-start gap-3">
            <DownloadIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">scrcpy Required</p>
              <p className="text-xs mt-0.5 opacity-80">
                Screen mirroring requires scrcpy. Click to download it (~10MB).
              </p>
              {isDownloading && downloadProgress && (
                <div className="mt-3">
                  <div className="h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-300"
                      style={{ width: `${downloadProgress.percent}%` }}
                    />
                  </div>
                  <p className="text-xs mt-1 opacity-70">{downloadProgress.message}</p>
                </div>
              )}
              {!isDownloading && (
                <button
                  onClick={downloadScrcpy}
                  className="mt-2 px-3 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded transition-colors"
                >
                  Download scrcpy
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="px-4 py-3 rounded-lg text-sm bg-red-500/15 border border-red-500/25 text-red-400 flex items-start gap-3">
          <ErrorIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-xs mt-0.5 opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {scrcpyAvailable && !needsDownload && (
        <>
          {/* Mirror Status */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isMirroring ? (
                  <>
                    <div className="relative">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                      <div className="absolute inset-0 w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-400">Mirroring Active</p>
                      <p className="text-xs text-text-muted">scrcpy window is open</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 bg-text-muted rounded-full" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">Ready to Mirror</p>
                      <p className="text-xs text-text-muted">Click Start to begin</p>
                    </div>
                  </>
                )}
              </div>
              {isMirroring ? (
                <button
                  onClick={stopMirror}
                  className="px-4 py-2 text-sm font-medium bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-md transition-all duration-150 btn-press flex items-center gap-2"
                >
                  <StopIcon />
                  Stop Mirror
                </button>
              ) : (
                <button
                  onClick={startMirror}
                  className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-md transition-all duration-150 btn-press flex items-center gap-2"
                >
                  <PlayIcon />
                  Start Mirror
                </button>
              )}
            </div>
          </div>

          {/* Configuration Options */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              Mirror Options
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showTouches ?? false}
                  onChange={(e) => setConfig({ ...config, showTouches: e.target.checked })}
                  className="w-4 h-4 rounded border-border-muted bg-surface-hover text-accent focus:ring-accent focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm text-text-primary">Show Touches</span>
                  <p className="text-xs text-text-muted">Display touch indicators on device</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.stayAwake ?? true}
                  onChange={(e) => setConfig({ ...config, stayAwake: e.target.checked })}
                  className="w-4 h-4 rounded border-border-muted bg-surface-hover text-accent focus:ring-accent focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm text-text-primary">Stay Awake</span>
                  <p className="text-xs text-text-muted">Keep device awake while mirroring</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.turnScreenOff ?? false}
                  onChange={(e) => setConfig({ ...config, turnScreenOff: e.target.checked })}
                  className="w-4 h-4 rounded border-border-muted bg-surface-hover text-accent focus:ring-accent focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm text-text-primary">Turn Screen Off</span>
                  <p className="text-xs text-text-muted">Turn off device screen during mirroring</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.alwaysOnTop ?? false}
                  onChange={(e) => setConfig({ ...config, alwaysOnTop: e.target.checked })}
                  className="w-4 h-4 rounded border-border-muted bg-surface-hover text-accent focus:ring-accent focus:ring-offset-0"
                />
                <div>
                  <span className="text-sm text-text-primary">Always on Top</span>
                  <p className="text-xs text-text-muted">Keep mirror window above other windows</p>
                </div>
              </label>
            </div>
          </div>
        </>
      )}

      {/* Tips */}
      <div className="bg-surface rounded-lg p-4 border border-border-muted mt-auto">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
          Keyboard Shortcuts
        </h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Right-click</kbd>
            <span>Back button</span>
          </li>
          <li className="flex items-start gap-2">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Middle-click</kbd>
            <span>Home button</span>
          </li>
          <li className="flex items-start gap-2">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Cmd+H</kbd>
            <span>Home button</span>
          </li>
          <li className="flex items-start gap-2">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Cmd+B</kbd>
            <span>Back button</span>
          </li>
          <li className="flex items-start gap-2">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Cmd+S</kbd>
            <span>App switch</span>
          </li>
          <li className="flex items-start gap-2">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Cmd+O</kbd>
            <span>Turn screen off (keep mirroring)</span>
          </li>
          <li className="flex items-start gap-2">
            <kbd className="px-1.5 py-0.5 bg-surface-hover rounded text-xs font-mono">Cmd+V</kbd>
            <span>Paste computer clipboard</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// Icons

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

const ErrorIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const StopIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
    />
  </svg>
);
