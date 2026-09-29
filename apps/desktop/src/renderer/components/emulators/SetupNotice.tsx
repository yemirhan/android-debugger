import React from 'react';
import type { EmulatorSetup } from '../../../main/emulator-types';
import { buttonStyles } from '../shared/Dialog';
import { EmulatorIcon } from '../icons';

const STUDIO_URL = 'https://developer.android.com/studio';

function openStudioPage() {
  void window.electronAPI.openExternal(STUDIO_URL).catch(() => {});
}

/** Full-panel screen when there is no Android SDK at all. */
export function SdkMissingScreen({ setup, onRecheck, checking }: { setup: EmulatorSetup; onRecheck: () => void; checking: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="w-12 h-12 mb-4 rounded-xl bg-surface border border-border-muted flex items-center justify-center text-text-muted">
          <EmulatorIcon />
        </div>
        <h3 className="text-base font-medium text-text-primary">Android SDK not found</h3>
        <p className="text-sm text-text-secondary mt-1.5">
          Emulators come with the Android SDK, which Android Studio installs. Android Debugger then finds and manages them for you.
        </p>
        <ol className="mt-5 space-y-3 text-sm">
          {[
            <>Install Android Studio.</>,
            <>Open it once and finish the setup wizard. It downloads the SDK, the emulator and a system image.</>,
            <>Come back here and choose Check again.</>,
          ].map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="w-5 h-5 flex-shrink-0 rounded-full bg-surface-hover text-[11px] text-text-secondary flex items-center justify-center font-mono">
                {index + 1}
              </span>
              <span className="text-text-secondary">{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-text-muted mt-5">
          Already have an SDK somewhere else? Set <span className="font-mono">ANDROID_HOME</span> to it and restart Android Debugger. Looked in:
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {setup.searchedSdkPaths.map((candidate) => (
            <li key={candidate} className="text-xs font-mono text-text-muted truncate" title={candidate}>
              {candidate}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-6">
          <button type="button" className={buttonStyles.primary} onClick={openStudioPage}>
            Get Android Studio
          </button>
          <button type="button" className={buttonStyles.secondary} onClick={onRecheck} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline notes when parts of the SDK are missing (emulator, cmdline-tools, Java). */
export function SetupNotice({ setup, onRecheck, checking }: { setup: EmulatorSetup; onRecheck: () => void; checking: boolean }) {
  const issues = setup.issues.filter((issue) => issue.id !== 'sdk');
  if (issues.length === 0) return null;
  const blocked = [!setup.canStart && 'starting', !setup.canCreate && 'creating', !setup.canDownload && 'downloading'].filter(Boolean);
  return (
    <div className="rounded-lg border border-log-warn/25 bg-log-warn/[0.06] px-4 py-3">
      <div className="flex items-start gap-3">
        <svg className="w-4 h-4 mt-0.5 text-log-warn flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v3.75m0 3.75h.008M10.3 3.9L2.4 17.6A2 2 0 004.1 20.6h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm text-text-primary">
            Some parts of the Android SDK are missing
            {blocked.length ? <span className="text-text-secondary">, so {blocked.join(', ').replace(/, ([^,]*)$/, ' and $1')} emulators is unavailable.</span> : '.'}
          </p>
          <ul className="space-y-1.5">
            {issues.map((issue) => (
              <li key={issue.id} className="text-xs">
                <span className="text-text-primary">{issue.title}.</span> <span className="text-text-secondary">{issue.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <button type="button" className={buttonStyles.secondary} onClick={onRecheck} disabled={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </div>
  );
}
