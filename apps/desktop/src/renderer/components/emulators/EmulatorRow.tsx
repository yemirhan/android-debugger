import React, { useState } from 'react';
import type { AvdInfo, EmulatorSetup, StartAvdOptions } from '../../../main/emulator-types';
import { updateAppSettings, useAppSettings } from '../../lib/app-settings';
import { startEmulator, stopEmulator, versionLabel } from '../../lib/emulators';
import { Menu, buttonStyles, type MenuEntry } from '../shared/Dialog';
import { BootSteps, StatusDot, avdSummary, isTransitioning, profileName, ramLabel, sizeLabel, stateLabel, useNow } from './parts';

export type RowDialog = 'wipe' | 'wipe-start' | 'delete' | 'rename';

interface EmulatorRowProps {
  avd: AvdInfo;
  setup: EmulatorSetup | null;
  /** The serial currently selected in the app. */
  selectedSerial: string | null;
  onUseInApp: (serial: string) => void;
  onOpenDialog: (dialog: RowDialog, avd: AvdInfo) => void;
  onShowImages: () => void;
  onShowInFolder: (avd: AvdInfo) => void;
  onDeleteSnapshot: (avd: AvdInfo, snapshot: string) => void;
}

const PlayGlyph = () => (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M7 5.2v13.6a.8.8 0 001.2.7l10.9-6.8a.8.8 0 000-1.4L8.2 4.5A.8.8 0 007 5.2z" />
  </svg>
);

const StopGlyph = () => (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
  </svg>
);

const Chevron = ({ up = false }: { up?: boolean }) => (
  <svg className={`w-3.5 h-3.5 transition-transform ${up ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const DotsGlyph = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

function Spec({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-muted">{label}</dt>
      <dd className={`text-sm text-text-primary truncate ${mono ? 'font-mono text-[13px]' : ''}`}>{children}</dd>
    </div>
  );
}

export function EmulatorRow({
  avd,
  setup,
  selectedSerial,
  onUseInApp,
  onOpenDialog,
  onShowImages,
  onShowInFolder,
  onDeleteSnapshot,
}: EmulatorRowProps) {
  const [expanded, setExpanded] = useState(false);
  const settings = useAppSettings();
  const busy = isTransitioning(avd);
  const now = useNow(avd.state === 'starting' || avd.state === 'booting');
  const stopped = avd.state === 'stopped';
  const running = avd.state === 'running';
  const inUse = running && !!avd.serial && avd.serial === selectedSerial;
  const failedBoot = stopped && avd.boot?.phase === 'failed' && avd.boot.error !== 'Stopped' ? avd.boot : null;

  const cannotStart = !setup?.canStart
    ? 'Install the Android Emulator first'
    : !avd.systemImageInstalled
      ? 'Its system image is not installed'
      : avd.problem
        ? avd.problem
        : null;
  const notStopped = stopped ? false : 'Stop it first';

  const start = (options: StartAvdOptions = {}) => void startEmulator(avd, { noAudio: settings.emulatorNoAudio, ...options });

  const startMenu: MenuEntry[] = [
    { id: 'quick', label: 'Quick boot', description: 'Resume from the last snapshot', onSelect: () => start() },
    { id: 'cold', label: 'Cold boot', description: 'Start Android from scratch', onSelect: () => start({ coldBoot: true }) },
    { id: 'headless', label: 'Start without a window', description: 'Headless, no emulator window', onSelect: () => start({ headless: true }) },
    'separator',
    {
      id: 'no-audio',
      label: 'Mute audio',
      checked: settings.emulatorNoAudio,
      onSelect: () => updateAppSettings({ emulatorNoAudio: !settings.emulatorNoAudio }),
    },
    'separator',
    { id: 'wipe-start', label: 'Wipe data and start…', tone: 'danger', onSelect: () => onOpenDialog('wipe-start', avd) },
  ];

  const moreMenu: MenuEntry[] = [
    { id: 'finder', label: 'Show in Finder', disabled: !avd.path, onSelect: () => onShowInFolder(avd) },
    {
      id: 'rename',
      label: 'Rename…',
      disabled: notStopped || (!setup?.canCreate ? 'Needs the command-line tools and Java' : false),
      onSelect: () => onOpenDialog('rename', avd),
    },
    'separator',
    { id: 'wipe', label: 'Wipe data…', tone: 'danger', disabled: notStopped, onSelect: () => onOpenDialog('wipe', avd) },
    { id: 'delete', label: 'Delete…', tone: 'danger', disabled: notStopped, onSelect: () => onOpenDialog('delete', avd) },
  ];

  return (
    <div className={`rounded-lg border bg-surface transition-colors ${inUse ? 'border-accent/40' : 'border-border-muted'}`}>
      <div className="flex items-center gap-3 pl-4 pr-3 py-3">
        <StatusDot state={avd.state} />
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex-1 min-w-0 text-left group"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-text-primary truncate group-hover:underline decoration-text-muted underline-offset-2">
              {avd.displayName}
            </span>
            {inUse && <span className="flex-shrink-0 text-[11px] px-1.5 py-px rounded bg-accent-muted text-accent">In use</span>}
            <span className="text-text-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Chevron up={expanded} />
            </span>
          </span>
          <span className="block text-xs text-text-muted truncate mt-0.5">{avdSummary(avd)}</span>
        </button>

        <div className="hidden md:flex flex-col items-end flex-shrink-0 w-[7.5rem] text-right">
          <span className={`text-xs ${running ? 'text-text-secondary' : busy && avd.state !== 'stopping' ? 'text-accent' : 'text-text-muted'}`}>
            {stateLabel(avd, now)}
          </span>
          {avd.serial && !stopped && <span className="text-[11px] font-mono text-text-muted">{avd.serial}</span>}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {stopped && (
            <div className="flex">
              <button
                type="button"
                onClick={() => start()}
                disabled={!!cannotStart}
                title={cannotStart ?? `Start ${avd.displayName}`}
                className={`${buttonStyles.primary} rounded-r-none pl-3 pr-3`}
              >
                <PlayGlyph />
                Start
              </button>
              <Menu
                label={`Start options for ${avd.displayName}`}
                items={startMenu}
                trigger={({ open, toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    disabled={!!cannotStart}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-label="More ways to start"
                    className="h-8 w-7 flex items-center justify-center rounded-r-md rounded-l-none border-l border-white/20 bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent transition-colors"
                  >
                    <Chevron />
                  </button>
                )}
              />
            </div>
          )}
          {running && avd.serial && !inUse && (
            <button type="button" className={buttonStyles.secondary} onClick={() => onUseInApp(avd.serial!)}>
              Use in app
            </button>
          )}
          {(running || avd.state === 'booting' || avd.state === 'starting') && (
            <button type="button" className={buttonStyles.secondary} onClick={() => void stopEmulator(avd)}>
              <StopGlyph />
              Stop
            </button>
          )}
          {avd.state === 'stopping' && (
            <button type="button" className={buttonStyles.secondary} disabled>
              Stopping…
            </button>
          )}
          <Menu
            label={`More actions for ${avd.displayName}`}
            items={moreMenu}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`More actions for ${avd.displayName}`}
                className={`w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors ${
                  open ? 'bg-surface-hover text-text-primary' : ''
                }`}
              >
                <DotsGlyph />
              </button>
            )}
          />
        </div>
      </div>

      {(avd.state === 'starting' || avd.state === 'booting') && (
        <div className="px-4 pb-3 -mt-0.5 pl-9">
          <BootSteps avd={avd} />
        </div>
      )}

      {failedBoot && (
        <p className="px-4 pb-3 -mt-0.5 pl-9 text-xs text-log-error">
          {failedBoot.message}: <span className="text-text-secondary">{failedBoot.error}</span>
        </p>
      )}

      {avd.problem && stopped && (
        <p className="px-4 pb-3 -mt-0.5 pl-9 text-xs text-log-warn">
          {avd.problem}.{' '}
          {!avd.systemImageInstalled && avd.systemImage && (
            <button type="button" onClick={onShowImages} className="underline underline-offset-2 hover:text-text-primary">
              Get system images
            </button>
          )}
        </p>
      )}

      {expanded && (
        <div className="border-t border-border-muted px-4 py-3 pl-9 space-y-3 animate-fade-in">
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
            <Spec label="Android">{versionLabel(avd.androidVersion, avd.apiLevel)}</Spec>
            <Spec label="Device profile">{avd.deviceProfile ? profileName(avd.deviceProfile) : '—'}</Spec>
            <Spec label="Variant">{avd.tagDisplay ?? '—'}</Spec>
            <Spec label="CPU" mono>
              {avd.abi ?? '—'}
            </Spec>
            <Spec label="RAM" mono>
              {ramLabel(avd.ramMb) ?? 'Default'}
            </Spec>
            <Spec label="Internal storage" mono>
              {sizeLabel(avd.storageBytes) ?? 'Default'}
            </Spec>
            <Spec label="SD card" mono>
              {avd.sdCard ?? 'None'}
            </Spec>
            <Spec label="Screen" mono>
              {avd.screen ? `${avd.screen.width} × ${avd.screen.height}${avd.screen.density ? ` · ${avd.screen.density} dpi` : ''}` : '—'}
            </Spec>
            <Spec label="Size on disk" mono>
              {sizeLabel(avd.sizeOnDiskBytes) ?? '—'}
            </Spec>
            <Spec label="AVD name" mono>
              {avd.name}
            </Spec>
          </dl>
          <div className="space-y-1">
            <p className="text-[11px] text-text-muted">System image</p>
            <p className="text-[13px] font-mono text-text-secondary break-all">{avd.systemImage ?? 'Unknown'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-text-muted">Folder</p>
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[13px] font-mono text-text-secondary truncate" title={avd.path}>
                {avd.path || '—'}
              </p>
              {avd.path && (
                <button type="button" onClick={() => onShowInFolder(avd)} className="text-xs text-accent hover:underline flex-shrink-0">
                  Show in Finder
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-text-muted">Snapshots</p>
            {avd.snapshots.length === 0 ? (
              <p className="text-xs text-text-muted">No saved snapshots. Quick boot saves one when the emulator closes.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {avd.snapshots.map((snapshot) => (
                  <li
                    key={snapshot}
                    className="flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md border border-border-muted bg-background text-xs"
                  >
                    <span className="font-mono text-text-secondary">{snapshot}</span>
                    <button
                      type="button"
                      disabled={!stopped}
                      title={stopped ? `Delete snapshot ${snapshot}` : 'Stop the emulator to delete snapshots'}
                      aria-label={`Delete snapshot ${snapshot}`}
                      onClick={() => onDeleteSnapshot(avd, snapshot)}
                      className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-log-error hover:bg-surface-hover disabled:opacity-40 disabled:hover:text-text-muted"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
