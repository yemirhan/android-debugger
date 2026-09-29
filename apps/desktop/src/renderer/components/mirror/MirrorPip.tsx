import { useEffect, useState } from 'react';
import { MirrorCanvas } from './MirrorCanvas';
import { MirrorDeviceRail } from './MirrorDeviceRail';
import { getMirrorSnapshot, setMirrorPinned, stopMirror, useMirror } from '../../lib/mirror/mirror-client';

interface MirrorPipProps {
  /** Currently selected, ready device (null when none). */
  activeDeviceId: string | null;
  /** The Screen mirror tool is open, so the floating player is not needed. */
  hidden: boolean;
  onOpenPanel: () => void;
}

/**
 * Floating player for a pinned mirror session while another tool is open.
 * Fully interactive; stops the session when the device goes away.
 */
export function MirrorPip({ activeDeviceId, hidden, onOpenPanel }: MirrorPipProps) {
  const mirror = useMirror();
  const [notice, setNotice] = useState<string | null>(null);

  // A pinned stream follows the selected device: switching or losing it ends it.
  useEffect(() => {
    const current = getMirrorSnapshot();
    if (current.status === 'idle' || current.status === 'error') return;
    if (current.deviceId !== activeDeviceId && !hidden) void stopMirror();
  }, [activeDeviceId, hidden]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const running = mirror.status === 'starting' || mirror.status === 'streaming';
  if (hidden || !mirror.pinned || (!running && mirror.status !== 'error')) return null;

  const close = () => {
    setMirrorPinned(false);
    void stopMirror();
  };

  const portrait = mirror.videoHeight >= mirror.videoWidth;
  const width = portrait ? 220 : 360;
  const height =
    mirror.videoWidth > 0 && mirror.videoHeight > 0 ? Math.round((width * mirror.videoHeight) / mirror.videoWidth) : 390;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 animate-pop-in overflow-hidden"
      style={{ width: width + 16 }}
      role="region"
      aria-label="Pinned screen mirror"
    >
      <div className="flex items-center justify-between gap-2 pl-3 pr-1 h-8 border-b border-border-muted">
        <div className="flex items-center gap-1.5 min-w-0 text-xs text-text-secondary">
          {mirror.status === 'streaming' && <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot shrink-0" />}
          <span className="truncate">{mirror.deviceName ?? mirror.deviceId ?? 'Device'}</span>
        </div>
        <div className="flex items-center">
          <button
            onClick={onOpenPanel}
            title="Open Screen mirror"
            aria-label="Open Screen mirror"
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
            </svg>
          </button>
          <button
            onClick={close}
            title="Stop mirroring"
            aria-label="Stop mirroring"
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      {mirror.status === 'error' ? (
        <div className="p-3 text-xs text-text-secondary">
          <p className="text-text-primary text-sm font-medium">Mirroring stopped</p>
          <p className="mt-1">{mirror.error}</p>
        </div>
      ) : (
        <>
          <div className="p-2 relative" style={{ height: height + 16 }}>
            <MirrorCanvas className="w-full h-full" videoWidth={mirror.videoWidth} videoHeight={mirror.videoHeight} />
            {mirror.status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted pointer-events-none">
                Connecting…
              </div>
            )}
            {notice && (
              <div className="absolute bottom-3 inset-x-3 px-2 py-1 rounded-md bg-surface-elevated border border-border text-[11px] text-text-primary truncate">
                {notice}
              </div>
            )}
          </div>
          <div className="border-t border-border-muted py-0.5">
            <MirrorDeviceRail
              compact
              deviceId={mirror.deviceId ?? ''}
              disabled={mirror.status !== 'streaming'}
              onNotice={setNotice}
            />
          </div>
        </>
      )}
    </div>
  );
}
