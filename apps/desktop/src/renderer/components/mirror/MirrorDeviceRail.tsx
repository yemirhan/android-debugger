import React, { useState } from 'react';
import { sendMirrorControl, setDeviceScreenOff, useMirror } from '../../lib/mirror/mirror-client';
import { ANDROID_KEYCODE } from '../../lib/mirror/keymap';

const KEY_DOWN = 0;
const KEY_UP = 1;

function pressKey(keycode: number): void {
  sendMirrorControl({ type: 'key', action: KEY_DOWN, keycode });
  sendMirrorControl({ type: 'key', action: KEY_UP, keycode });
}

interface MirrorDeviceRailProps {
  deviceId: string;
  disabled: boolean;
  onNotice: (message: string) => void;
  /** Horizontal bar (floating player) instead of the vertical side rail. */
  compact?: boolean;
}

/** Hardware buttons and device actions for the mirrored device. */
export function MirrorDeviceRail({ deviceId, disabled, onNotice, compact = false }: MirrorDeviceRailProps) {
  const mirror = useMirror();
  const [capturing, setCapturing] = useState(false);

  const takeScreenshot = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const result = await window.electronAPI.takeScreenshot(deviceId);
      if (result?.path) onNotice(`Screenshot saved to ${result.path}`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not take a screenshot');
    } finally {
      setCapturing(false);
    }
  };

  const groups: Array<Array<{ label: string; icon: React.ReactNode; onClick: () => void; active?: boolean; busy?: boolean }>> = [
    [
      { label: 'Power', icon: <PowerIcon />, onClick: () => pressKey(ANDROID_KEYCODE.POWER) },
      { label: 'Volume up', icon: <VolumeUpIcon />, onClick: () => pressKey(ANDROID_KEYCODE.VOLUME_UP) },
      { label: 'Volume down', icon: <VolumeDownIcon />, onClick: () => pressKey(ANDROID_KEYCODE.VOLUME_DOWN) },
    ],
    [
      { label: 'Rotate', icon: <RotateIcon />, onClick: () => sendMirrorControl({ type: 'rotate' }) },
      {
        label: mirror.screenOff ? 'Turn the device screen back on' : 'Turn the device screen off (keeps mirroring)',
        icon: <ScreenOffIcon />,
        onClick: () => setDeviceScreenOff(!mirror.screenOff),
        active: mirror.screenOff,
      },
      { label: 'Show notifications', icon: <BellIcon />, onClick: () => sendMirrorControl({ type: 'expand-notifications' }) },
      { label: 'Save a screenshot', icon: <CameraIcon />, onClick: () => void takeScreenshot(), busy: capturing },
    ],
    [
      {
        label: 'Back',
        icon: <BackIcon />,
        onClick: () => {
          sendMirrorControl({ type: 'back-or-screen-on', action: KEY_DOWN });
          sendMirrorControl({ type: 'back-or-screen-on', action: KEY_UP });
        },
      },
      { label: 'Home', icon: <HomeIcon />, onClick: () => pressKey(ANDROID_KEYCODE.HOME) },
      { label: 'Recent apps', icon: <RecentsIcon />, onClick: () => pressKey(ANDROID_KEYCODE.APP_SWITCH) },
    ],
  ];

  return (
    <div
      className={
        compact
          ? 'flex items-center justify-center gap-0.5'
          : 'w-12 shrink-0 border-l border-border-muted flex flex-col items-center py-3 gap-1 overflow-y-auto'
      }
      aria-label="Device buttons"
    >
      {groups.map((group, index) => (
        <React.Fragment key={index}>
          {index > 0 && (compact ? <div className="w-px h-4 bg-border-muted mx-1" /> : <div className="w-6 border-t border-border-muted my-1.5" />)}
          {group
            .filter((item) => !compact || ['Back', 'Home', 'Recent apps'].includes(item.label))
            .map((item) => (
              <button
                key={item.label}
                onClick={item.onClick}
                disabled={disabled || item.busy}
                title={item.label}
                aria-label={item.label}
                aria-pressed={item.active}
                className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                  item.active ? 'bg-accent-muted text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                {item.icon}
              </button>
            ))}
        </React.Fragment>
      ))}
    </div>
  );
}

const icon = (d: string) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={d} />
  </svg>
);

const PowerIcon = () => icon('M12 3v8M6.3 6.8a8 8 0 1011.4 0');
const VolumeUpIcon = () => icon('M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13');
const VolumeDownIcon = () => icon('M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7');
const RotateIcon = () => icon('M4 4v5h5M20 20v-5h-5M5.1 15a7.5 7.5 0 0012.9 2.3M18.9 9A7.5 7.5 0 006 6.7');
const ScreenOffIcon = () => icon('M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM4 4l16 16');
const BellIcon = () => icon('M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-5-5.9V4a1 1 0 10-2 0v1.1A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9');
const CameraIcon = () => icon('M3 9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z');
const BackIcon = () => icon('M15 6l-6 6 6 6');
const HomeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="6" strokeWidth={1.6} />
  </svg>
);
const RecentsIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" strokeWidth={1.6} />
  </svg>
);
