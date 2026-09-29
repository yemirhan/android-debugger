import React from 'react';
import type { AvdInfo } from '../../../main/emulator-types';
import { useAppSettings } from '../../lib/app-settings';
import { startEmulator, useEmulators, versionLabel } from '../../lib/emulators';
import { StatusDot, stateLabel, useNow } from './parts';

interface EmulatorQuickStartProps {
  /** Opens the Emulators tool. */
  onManage: () => void;
  /** Max AVDs listed; the rest are one click away in the Emulators tool. */
  limit?: number;
  /** "picker": compact rows for the device dropdown; "screen": the no-device screen. */
  variant: 'picker' | 'screen';
  /** Called after an emulator was asked to start (e.g. to close the dropdown). */
  onStarted?: () => void;
}

function sortForQuickStart(avds: AvdInfo[]): AvdInfo[] {
  // Booting first (so progress is visible), then stopped ones; running ones are already in the device list.
  const rank = (avd: AvdInfo) => (avd.state === 'starting' || avd.state === 'booting' ? 0 : avd.state === 'stopped' ? 1 : 2);
  return avds.filter((avd) => avd.state !== 'running').sort((a, b) => rank(a) - rank(b));
}

/**
 * "Start an emulator" list for places that have no device yet: the device
 * picker dropdown and the no-device screen. Renders nothing without an SDK.
 */
export function EmulatorQuickStart({ onManage, limit = 4, variant, onStarted }: EmulatorQuickStartProps) {
  const { setup, avds, loaded } = useEmulators({ live: true });
  const settings = useAppSettings();
  const candidates = sortForQuickStart(avds);
  const now = useNow(candidates.some((avd) => avd.state === 'starting' || avd.state === 'booting'));
  if (!loaded || !setup?.sdkPath) return null;

  const shown = candidates.slice(0, limit);
  const more = candidates.length - shown.length;
  const canStart = setup.canStart;

  const start = (avd: AvdInfo) => {
    void startEmulator(avd, { noAudio: settings.emulatorNoAudio });
    onStarted?.();
  };

  if (variant === 'picker') {
    return (
      <div className="border-t border-border-muted p-1">
        <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
          <span className="text-[11px] text-text-muted">{shown.length ? 'Start an emulator' : 'Emulators'}</span>
          <button type="button" onClick={onManage} className="text-[11px] text-text-secondary hover:text-text-primary">
            {avds.length ? 'Manage…' : 'Create one…'}
          </button>
        </div>
        {shown.map((avd) => {
          const busy = avd.state !== 'stopped';
          return (
            <button
              key={avd.name}
              type="button"
              disabled={busy || !canStart || !avd.systemImageInstalled}
              onClick={() => start(avd)}
              className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-md text-left hover:bg-surface-hover disabled:hover:bg-transparent disabled:cursor-default transition-colors group"
            >
              <StatusDot state={avd.state} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-text-primary truncate">{avd.displayName}</span>
                <span className="block text-xs text-text-muted truncate">{versionLabel(avd.androidVersion, avd.apiLevel)}</span>
              </span>
              <span className={`text-[11px] flex-shrink-0 ${busy ? 'text-accent' : 'text-text-muted group-hover:text-text-primary'}`}>
                {busy ? stateLabel(avd, now) : 'Start'}
              </span>
            </button>
          );
        })}
        {more > 0 && (
          <button type="button" onClick={onManage} className="w-full px-2.5 py-1.5 text-left text-xs text-text-muted hover:text-text-primary">
            {more} more in Emulators…
          </button>
        )}
      </div>
    );
  }

  if (avds.length === 0) {
    return setup.canCreate ? (
      <p className="mt-6 text-sm text-text-secondary">
        No emulator yet?{' '}
        <button type="button" onClick={onManage} className="text-accent hover:underline">
          Create one
        </button>
      </p>
    ) : null;
  }

  return (
    <div className="mt-8 text-left">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-medium text-text-muted">Or start an emulator</p>
        <button type="button" onClick={onManage} className="text-xs text-text-secondary hover:text-text-primary">
          Manage emulators
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-text-secondary">All your emulators are running.</p>
      ) : (
        <ul className="rounded-lg border border-border-muted bg-surface divide-y divide-border-muted">
          {shown.map((avd) => {
            const busy = avd.state !== 'stopped';
            return (
              <li key={avd.name} className="flex items-center gap-3 px-3 py-2">
                <StatusDot state={avd.state} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary truncate">{avd.displayName}</span>
                  <span className="block text-xs text-text-muted truncate">{versionLabel(avd.androidVersion, avd.apiLevel)}</span>
                </span>
                {busy ? (
                  <span className="text-xs text-accent">{stateLabel(avd, now)}</span>
                ) : (
                  <button
                    type="button"
                    disabled={!canStart || !avd.systemImageInstalled}
                    onClick={() => start(avd)}
                    className="h-7 px-2.5 text-xs font-medium rounded-md border border-border-muted bg-surface-elevated text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
                  >
                    Start
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
