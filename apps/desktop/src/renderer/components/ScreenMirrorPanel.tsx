import React, { useEffect, useRef, useState } from 'react';
import type { Device } from '@android-debugger/shared';
import { useScreenMirror } from '../hooks/useScreenMirror';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';
import { MirrorCanvas } from './mirror/MirrorCanvas';
import { MirrorSettingsMenu } from './mirror/MirrorSettingsMenu';
import { MirrorDeviceRail } from './mirror/MirrorDeviceRail';
import {
  clearMirrorError,
  getMirrorSnapshot,
  getQualityPreset,
  setMirrorPinned,
  startMirror,
  stopMirror,
  useMirror,
} from '../lib/mirror/mirror-client';

interface ScreenMirrorPanelProps {
  device: Device;
}

export function ScreenMirrorPanel({ device }: ScreenMirrorPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const env = useScreenMirror(device);
  const mirror = useMirror();
  const guide = tabGuides['screen-mirror'];

  // The user explicitly paused mirroring for this device: don't auto-restart.
  const pausedFor = useRef<string | null>(null);
  const serverReady = env.serverStatus?.available === true;
  const isThisDevice = mirror.deviceId === device.id;
  const live = isThisDevice && (mirror.status === 'starting' || mirror.status === 'streaming');

  // Mirror by default: start as soon as the server is known to be installed,
  // and follow device switches.
  useEffect(() => {
    if (!serverReady || env.isWindowOpen) return;
    const current = getMirrorSnapshot();
    if (current.deviceId === device.id && current.status !== 'idle') return;
    if (pausedFor.current === device.id) return;
    void startMirror(device.id);
  }, [serverReady, env.isWindowOpen, device.id]);

  useEffect(() => {
    if (pausedFor.current !== device.id) pausedFor.current = null;
  }, [device.id]);

  // Leaving the tool stops the stream unless it is pinned (then the floating
  // player keeps it on screen).
  useEffect(() => {
    return () => {
      if (!getMirrorSnapshot().pinned) void stopMirror();
    };
  }, []);

  // Device clipboard copies land on the host clipboard.
  const clipboardCopies = useRef(mirror.clipboardCopies);
  useEffect(() => {
    if (mirror.clipboardCopies !== clipboardCopies.current) {
      clipboardCopies.current = mirror.clipboardCopies;
      setNotice('Copied from the device clipboard');
    }
  }, [mirror.clipboardCopies]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleResume = () => {
    pausedFor.current = null;
    clearMirrorError();
    void startMirror(device.id);
  };

  const handlePause = () => {
    pausedFor.current = device.id;
    void stopMirror();
  };

  const handleOpenWindow = async () => {
    pausedFor.current = device.id;
    await stopMirror();
    await env.openWindow({
      stayAwake: mirror.prefs.stayAwake,
      showTouches: mirror.prefs.showTouches,
      maxSize: getQualityPreset(mirror.qualityId).maxSize || undefined,
    });
  };

  const handleMirrorHere = async () => {
    await env.closeWindow();
    pausedFor.current = null;
    void startMirror(device.id);
  };

  const handleDownload = async () => {
    if (await env.downloadScrcpy()) pausedFor.current = null;
  };

  const restartIfLive = () => {
    if (live) void startMirror(device.id, { turnScreenOff: mirror.screenOff });
  };

  const streaming = isThisDevice && mirror.status === 'streaming';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      {/* Header */}
      <div className="@container flex items-center justify-between gap-3 px-4 h-12 border-b border-border-muted shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-semibold whitespace-nowrap">Screen mirror</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="How screen mirroring works"
            aria-label="How screen mirroring works"
          >
            <InfoIcon />
          </button>
          <StatusPill status={isThisDevice ? mirror.status : 'idle'} windowOpen={env.isWindowOpen} />
        </div>
        <div className="flex items-center gap-2">
          {serverReady && !env.isWindowOpen && (
            <MirrorSettingsMenu onQualityChange={restartIfLive} onPrefsChange={restartIfLive} />
          )}
          {live && (
            <button
              onClick={() => setMirrorPinned(!mirror.pinned)}
              aria-pressed={mirror.pinned}
              title={
                mirror.pinned
                  ? 'Pinned: the mirror stays open in a floating player when you switch tools'
                  : 'Keep mirroring in a floating player when you switch tools'
              }
              className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-sm border transition-colors ${
                mirror.pinned
                  ? 'border-accent/50 bg-accent-muted text-text-primary'
                  : 'border-border-muted text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              <PinIcon filled={mirror.pinned} />
              <span className="hidden @[640px]:inline">{mirror.pinned ? 'Pinned' : 'Pin'}</span>
            </button>
          )}
          {env.scrcpyAvailable && !env.isWindowOpen && (
            <button
              onClick={handleOpenWindow}
              title="Open in separate window (scrcpy)"
              aria-label="Open in separate window"
              className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-sm whitespace-nowrap border border-border-muted text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <ExternalIcon />
              <span className="hidden @[760px]:inline">Open in separate window</span>
            </button>
          )}
          {live && (
            <button
              onClick={handlePause}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium border border-border bg-surface text-text-primary hover:bg-surface-hover transition-colors"
            >
              <StopIcon />
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Stage */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-2">
          <div className="relative flex-1 min-h-0 flex">
            {live && (
              <MirrorCanvas
                className="flex-1"
                videoWidth={mirror.videoWidth}
                videoHeight={mirror.videoHeight}
                onFocusChange={setCanvasFocused}
              />
            )}

            {live && mirror.status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2.5 text-sm text-text-secondary">
                  <Spinner />
                  Connecting to {device.model || device.id}…
                </div>
              </div>
            )}

            {!live && (
              <StageMessage
                env={env}
                device={device}
                error={isThisDevice && mirror.status === 'error' ? mirror.error : null}
                serverMissing={
                  env.serverStatus !== null &&
                  (!env.serverStatus.available || (isThisDevice && mirror.errorCode === 'server-missing'))
                }
                onResume={handleResume}
                onOpenWindow={handleOpenWindow}
                onMirrorHere={handleMirrorHere}
                onDownload={handleDownload}
              />
            )}

            {notice && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-surface-elevated border border-border text-xs text-text-primary shadow-xl shadow-black/40 animate-pop-in">
                {notice}
              </div>
            )}
          </div>

          {/* Footer: stats and input hint */}
          <div className="h-5 flex items-center justify-between gap-4 text-xs text-text-muted shrink-0 min-w-0">
            <div className="font-mono whitespace-nowrap shrink-0">
              {streaming && (
                <>
                  <span title="Frames per second. The device only sends frames when the screen changes.">{mirror.stats.fps} fps</span>
                  {' · '}
                  {(mirror.stats.bitrateKbps / 1000).toFixed(1)} Mbps
                  {' · '}
                  <span title="Time to decode a frame after it arrives">{mirror.stats.decodeMs.toFixed(1)} ms</span>
                  {' · '}
                  {mirror.videoWidth}×{mirror.videoHeight}
                </>
              )}
            </div>
            <div className="truncate min-w-0 text-right">
              {streaming &&
                (canvasFocused ? (
                  <>Typing goes to the device · <span className="kbd">⌘V</span> pastes your clipboard</>
                ) : (
                  <>Click to tap, drag to swipe, right-click for back</>
                ))}
            </div>
          </div>
        </div>

        {/* Device controls */}
        {live && <MirrorDeviceRail deviceId={device.id} disabled={!streaming} onNotice={setNotice} />}
      </div>
    </div>
  );
}

interface StageMessageProps {
  env: ReturnType<typeof useScreenMirror>;
  device: Device;
  error: string | null;
  serverMissing: boolean;
  onResume: () => void;
  onOpenWindow: () => void;
  onMirrorHere: () => void;
  onDownload: () => void;
}

function StageMessage({ env, device, error, serverMissing, onResume, onOpenWindow, onMirrorHere, onDownload }: StageMessageProps) {
  const name = device.model || device.id;
  const primary =
    'h-8 px-3.5 inline-flex items-center rounded-md text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50';
  const secondary =
    'h-8 px-3.5 inline-flex items-center rounded-md text-sm font-medium border border-border bg-surface text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50';

  let title: string;
  let body: React.ReactNode;
  let actions: React.ReactNode = null;

  if (env.serverStatus === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  } else if (env.isWindowOpen) {
    title = 'Mirroring in a separate window';
    body = `The scrcpy window is showing ${name}. Close it to mirror here again.`;
    actions = (
      <>
        <button onClick={onMirrorHere} className={primary}>Mirror here instead</button>
        <button onClick={() => void env.closeWindow()} className={secondary}>Close window</button>
      </>
    );
  } else if (serverMissing) {
    title = 'Install scrcpy to mirror here';
    body = (
      <>
        In-app mirroring uses the scrcpy server. Install it with Homebrew, then check again:
        <code className="block mt-3 px-3 py-2 rounded-md bg-background border border-border-muted font-mono text-xs text-text-primary text-left select-text">
          brew install scrcpy
        </code>
        <span className="block mt-3">Or download it here (about 10 MB).</span>
      </>
    );
    actions = env.isDownloading ? (
      <div className="w-56">
        <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${env.downloadProgress?.percent ?? 0}%` }}
          />
        </div>
        <p className="text-xs text-text-muted mt-1.5">{env.downloadProgress?.message}</p>
      </div>
    ) : (
      <>
        <button onClick={onDownload} className={primary}>Download scrcpy</button>
        <button onClick={() => void env.checkEnvironment()} className={secondary}>Check again</button>
      </>
    );
  } else if (error) {
    title = 'Mirroring stopped';
    body = error;
    actions = (
      <>
        <button onClick={onResume} className={primary}>Try again</button>
        {env.scrcpyAvailable && (
          <button onClick={onOpenWindow} className={secondary}>Open in separate window</button>
        )}
      </>
    );
  } else {
    title = 'Mirroring is paused';
    body = `Resume to see and control ${name} here.`;
    actions = <button onClick={onResume} className={primary}>Resume mirroring</button>;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-surface border border-border-muted flex items-center justify-center text-text-muted">
          <PhoneIcon />
        </div>
        <p className="text-base font-medium text-text-primary">{title}</p>
        <div className="text-sm text-text-secondary mt-1.5">{body}</div>
        {env.windowError && <p className="text-sm text-red-400 mt-3">{env.windowError}</p>}
        {actions && <div className="mt-5 flex items-center justify-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function StatusPill({ status, windowOpen }: { status: string; windowOpen: boolean }) {
  if (windowOpen) {
    return <span className="text-xs text-text-muted">In separate window</span>;
  }
  if (status === 'streaming') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
        <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot" />
        Live
      </span>
    );
  }
  if (status === 'starting') return <span className="text-xs text-text-muted">Connecting…</span>;
  return null;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const PhoneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6" />
  </svg>
);

const ExternalIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
