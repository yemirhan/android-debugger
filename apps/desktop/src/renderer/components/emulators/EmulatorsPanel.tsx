import React, { useCallback, useState } from 'react';
import type { AvdInfo } from '../../../main/emulator-types';
import { validateAvdName } from '../../../main/emulator-parsers';
import { tabGuides } from '../../data/tabGuides';
import {
  refreshEmulators,
  runEmulatorTask,
  startEmulator,
  useCreateEmulatorRequest,
  useEmulators,
} from '../../lib/emulators';
import { useAppSettings } from '../../lib/app-settings';
import { toast } from '../../lib/toast';
import { EmulatorIcon, InfoIcon } from '../icons';
import { ConfirmDialog, Dialog, buttonStyles } from '../shared/Dialog';
import { InfoModal } from '../shared/InfoModal';
import { CreateEmulatorDialog } from './CreateEmulatorDialog';
import { EmulatorRow, type RowDialog } from './EmulatorRow';
import { SdkMissingScreen, SetupNotice } from './SetupNotice';
import { SystemImagesView } from './SystemImagesView';

interface EmulatorsPanelProps {
  /** Serial of the device selected in the app, if any. */
  selectedSerial: string | null;
  onUseInApp: (serial: string) => void;
}

type View = 'devices' | 'images';

const PlusGlyph = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeWidth={2.25} d="M12 5v14M5 12h14" />
  </svg>
);

const RefreshGlyph = ({ spinning }: { spinning: boolean }) => (
  <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

function RenameDialog({ avd, existing, onClose }: { avd: AvdInfo | null; existing: string[]; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !!avd;
  React.useEffect(() => {
    if (avd) {
      setValue(avd.name);
      setError(null);
      setBusy(false);
    }
  }, [avd]);
  const problem = avd && value !== avd.name ? validateAvdName(value, existing.filter((name) => name !== avd.name)) : null;
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!avd || problem || value.trim() === avd.name) return;
    setBusy(true);
    const ok = await runEmulatorTask('Renaming…', `Renamed to ${value.trim()}`, `Could not rename ${avd.displayName}`, () =>
      window.electronAPI.emulators.rename(avd.name, value.trim())
    );
    setBusy(false);
    if (ok) onClose();
    else setError('The rename failed. See the message in the corner for details.');
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title={`Rename ${avd?.displayName ?? ''}`}
      description="Changes the AVD name used by the emulator and Android Studio. Its data is kept."
      footer={
        <>
          <button type="button" className={buttonStyles.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="rename-emulator-form" className={buttonStyles.primary} disabled={busy || !!problem || value.trim() === avd?.name}>
            {busy ? 'Renaming…' : 'Rename'}
          </button>
        </>
      }
    >
      <form id="rename-emulator-form" onSubmit={submit}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label="New name"
          data-autofocus
          className="w-full h-8 px-2.5 bg-background rounded-md border border-border-muted text-sm text-text-primary outline-none focus:border-accent"
        />
        {(problem || error) && <p className="mt-1.5 text-xs text-log-error">{problem ?? error}</p>}
      </form>
    </Dialog>
  );
}

export function EmulatorsPanel({ selectedSerial, onUseInApp }: EmulatorsPanelProps) {
  const { setup, avds, loaded, loading, error } = useEmulators({ live: true });
  const settings = useAppSettings();
  const [view, setView] = useState<View>('devices');
  const [showInfo, setShowInfo] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createImage, setCreateImage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: RowDialog; avd: AvdInfo } | null>(null);
  const [snapshotToDelete, setSnapshotToDelete] = useState<{ avd: AvdInfo; snapshot: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const guide = tabGuides.emulators;

  const openCreate = useCallback((imageId: string | null = null) => {
    setCreateImage(imageId);
    setCreateOpen(true);
  }, []);
  useCreateEmulatorRequest(useCallback(() => openCreate(null), [openCreate]));

  const recheck = async () => {
    setChecking(true);
    try {
      await window.electronAPI.emulators.getSetup(true);
      await refreshEmulators();
    } finally {
      setChecking(false);
    }
  };

  const showInFolder = (avd: AvdInfo) => {
    window.electronAPI.emulators.showInFolder(avd.name).catch((reason) => toast.error('Could not open the folder', { description: String(reason) }));
  };

  const running = avds.filter((avd) => avd.state === 'running').length;
  const subtitle = !loaded
    ? 'Looking for emulators…'
    : setup && !setup.sdkPath
      ? 'Needs the Android SDK'
    : avds.length === 0
      ? 'No virtual devices yet'
      : `${avds.length} virtual device${avds.length === 1 ? '' : 's'}${running ? ` · ${running} running` : ''}`;

  const sdkMissing = setup && !setup.sdkPath;
  const current = dialog?.avd ?? null;

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

      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Emulators</h2>
              <button
                onClick={() => setShowInfo(true)}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Learn more about this feature"
              >
                <InfoIcon />
              </button>
            </div>
            <p className="text-xs text-text-muted truncate">{subtitle}</p>
          </div>
          {!sdkMissing && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => void refreshEmulators()}
                className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                title="Refresh"
                aria-label="Refresh emulators"
              >
                <RefreshGlyph spinning={loading} />
              </button>
              <button
                type="button"
                className={buttonStyles.primary}
                onClick={() => openCreate(null)}
                disabled={!setup?.canCreate}
                title={setup?.canCreate ? undefined : 'Needs the Android SDK command-line tools and Java'}
              >
                <PlusGlyph />
                Create emulator
              </button>
            </div>
          )}
        </div>
        {!sdkMissing && (
          <div role="tablist" aria-label="Emulator views" className="flex w-fit h-8 p-0.5 rounded-md border border-border-muted bg-background">
            {(
              [
                ['devices', 'Virtual devices', avds.length],
                ['images', 'System images', null],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 rounded text-sm transition-colors ${
                  view === id ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {label}
                {count !== null && loaded && <span className="text-xs font-mono text-text-muted">{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {sdkMissing ? (
        <SdkMissingScreen setup={setup} onRecheck={() => void recheck()} checking={checking} />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          {setup && <SetupNotice setup={setup} onRecheck={() => void recheck()} checking={checking} />}
          {error && (
            <p className="rounded-lg border border-log-error/30 bg-log-error/[0.06] px-4 py-3 text-sm text-log-error">
              Could not read emulators: <span className="text-text-secondary">{error}</span>
            </p>
          )}

          {view === 'images' ? (
            <SystemImagesView onCreateWithImage={(imageId) => openCreate(imageId)} />
          ) : !loaded ? (
            <div className="space-y-3">
              {[0, 1].map((index) => (
                <div key={index} className="h-[62px] rounded-lg border border-border-muted bg-surface animate-pulse" />
              ))}
            </div>
          ) : avds.length === 0 ? (
            <div className="flex flex-col items-center text-center py-16 px-6">
              <div className="w-12 h-12 mb-4 rounded-xl bg-surface border border-border-muted flex items-center justify-center text-text-muted">
                <EmulatorIcon />
              </div>
              <p className="text-sm font-medium text-text-primary">No emulators yet</p>
              <p className="text-sm text-text-secondary mt-1 max-w-sm">
                An emulator is a virtual Android device that runs on this computer. Create one to test without a phone.
              </p>
              <div className="flex gap-2 mt-5">
                <button type="button" className={buttonStyles.primary} disabled={!setup?.canCreate} onClick={() => openCreate(null)}>
                  <PlusGlyph />
                  Create emulator
                </button>
                <button type="button" className={buttonStyles.secondary} onClick={() => setView('images')}>
                  System images
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {avds.map((avd) => (
                <EmulatorRow
                  key={avd.name}
                  avd={avd}
                  setup={setup}
                  selectedSerial={selectedSerial}
                  onUseInApp={onUseInApp}
                  onOpenDialog={(kind, target) => setDialog({ kind, avd: target })}
                  onShowImages={() => setView('images')}
                  onShowInFolder={showInFolder}
                  onDeleteSnapshot={(target, snapshot) => setSnapshotToDelete({ avd: target, snapshot })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateEmulatorDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initialImageId={createImage}
        onBrowseImages={() => {
          setCreateOpen(false);
          setView('images');
        }}
      />

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={`Delete ${current?.displayName ?? ''}?`}
        body={
          <>
            <p>Removes the emulator and everything on it: apps, data and snapshots. This cannot be undone.</p>
            {current?.path && <p className="text-xs font-mono text-text-muted break-all">{current.path}</p>}
          </>
        }
        confirmLabel="Delete emulator"
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          if (!current) return;
          await runEmulatorTask(`Deleting ${current.displayName}…`, `Deleted ${current.displayName}`, `Could not delete ${current.displayName}`, () =>
            window.electronAPI.emulators.delete(current.name)
          );
          setDialog(null);
        }}
      />

      <ConfirmDialog
        open={dialog?.kind === 'wipe'}
        title={`Wipe data on ${current?.displayName ?? ''}?`}
        body={<p>Resets it to a freshly created device: installed apps, accounts, files and snapshots are erased. The emulator itself stays.</p>}
        confirmLabel="Wipe data"
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          if (!current) return;
          await runEmulatorTask(`Wiping ${current.displayName}…`, `${current.displayName} wiped`, `Could not wipe ${current.displayName}`, () =>
            window.electronAPI.emulators.wipe(current.name)
          );
          setDialog(null);
        }}
      />

      <ConfirmDialog
        open={dialog?.kind === 'wipe-start'}
        title={`Wipe data and start ${current?.displayName ?? ''}?`}
        body={<p>Erases installed apps, accounts and files, then boots it fresh. This cannot be undone.</p>}
        confirmLabel="Wipe and start"
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          if (!current) return;
          await startEmulator(current, { wipeData: true, noAudio: settings.emulatorNoAudio });
          setDialog(null);
        }}
      />

      <ConfirmDialog
        open={!!snapshotToDelete}
        title={`Delete snapshot “${snapshotToDelete?.snapshot ?? ''}”?`}
        body={
          <p>
            {snapshotToDelete?.snapshot === 'default_boot'
              ? 'This is the quick-boot snapshot. The next start is a cold boot, and a new one is saved when the emulator closes.'
              : 'The emulator can no longer be restored to this saved state.'}
          </p>
        }
        confirmLabel="Delete snapshot"
        onCancel={() => setSnapshotToDelete(null)}
        onConfirm={async () => {
          if (!snapshotToDelete) return;
          const { avd, snapshot } = snapshotToDelete;
          await runEmulatorTask('Deleting snapshot…', `Deleted snapshot ${snapshot}`, 'Could not delete the snapshot', () =>
            window.electronAPI.emulators.deleteSnapshot(avd.name, snapshot)
          );
          setSnapshotToDelete(null);
        }}
      />

      <RenameDialog avd={dialog?.kind === 'rename' ? current : null} existing={avds.map((avd) => avd.name)} onClose={() => setDialog(null)} />
    </div>
  );
}
