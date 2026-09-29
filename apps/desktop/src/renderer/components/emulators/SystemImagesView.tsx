import React, { useEffect, useMemo, useState } from 'react';
import type { AvailableImagesResult, ImageInstallJob, SystemImage } from '../../../main/emulator-types';
import { isPreviewApi } from '../../../main/emulator-parsers';
import { emulatorError, useEmulators, versionLabel } from '../../lib/emulators';
import { toast } from '../../lib/toast';
import { Dialog, buttonStyles } from '../shared/Dialog';

interface SystemImagesViewProps {
  onCreateWithImage: (imageId: string) => void;
}

/** Variants most people want; the rest (ATD, 16 KB pages, TV, Wear…) sit behind "Show all". */
const COMMON_TAGS = new Set(['google_apis_playstore', 'google_apis', 'default']);

function ImageRow({ image, trailing, detail }: { image: SystemImage; trailing?: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">
          {versionLabel(image.androidVersion, image.apiLevel)}
          <span className="text-text-muted"> · {image.tagDisplay}</span>
        </p>
        <p className="text-xs text-text-muted truncate">
          <span className="font-mono" title={image.id}>{image.id}</span>
          {image.revision ? <span> · rev {image.revision}</span> : null}
        </p>
        {detail}
      </div>
      {trailing}
    </div>
  );
}

function JobProgress({ job }: { job: ImageInstallJob }) {
  const percent = job.percent ?? null;
  return (
    <div className="mt-1.5 flex items-center gap-3">
      <div className="h-1 w-48 rounded-full bg-surface-hover overflow-hidden">
        <div
          className={`h-full rounded-full bg-accent transition-[width] duration-300 ${percent === null ? 'w-1/3 animate-pulse-dot' : ''}`}
          style={percent === null ? undefined : { width: `${Math.max(2, percent)}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary truncate">
        {job.message}
        {percent !== null && job.phase !== 'done' ? <span className="font-mono text-text-muted"> {percent}%</span> : null}
      </span>
    </div>
  );
}

export function SystemImagesView({ onCreateWithImage }: SystemImagesViewProps) {
  const { setup, avds, jobs } = useEmulators();
  const [installed, setInstalled] = useState<SystemImage[] | null>(null);
  const [available, setAvailable] = useState<AvailableImagesResult | null>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [availableError, setAvailableError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [licenseBusy, setLicenseBusy] = useState(false);

  const activeJob = jobs.find((job) => job.phase !== 'done' && job.phase !== 'failed' && job.phase !== 'cancelled') ?? null;
  const lastFinished = [...jobs].reverse().find((job) => job.phase === 'done' || job.phase === 'failed' || job.phase === 'cancelled');

  const loadInstalled = () =>
    window.electronAPI.emulators
      .getSystemImages()
      .then(setInstalled)
      .catch(() => setInstalled([]));

  useEffect(() => {
    void loadInstalled();
  }, []);

  // A finished download changes both lists.
  const doneKey = jobs.filter((job) => job.phase === 'done').map((job) => job.id).join();
  useEffect(() => {
    if (!doneKey) return;
    void loadInstalled();
    if (available) void loadAvailable(false);
  }, [doneKey]);

  const loadAvailable = async (force: boolean) => {
    setLoadingAvailable(true);
    setAvailableError(null);
    try {
      setAvailable(await window.electronAPI.emulators.getAvailableImages(force));
    } catch (error) {
      setAvailableError(emulatorError(error));
    } finally {
      setLoadingAvailable(false);
    }
  };

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const avd of avds) if (avd.systemImage) counts.set(avd.systemImage, (counts.get(avd.systemImage) ?? 0) + 1);
    return counts;
  }, [avds]);

  const visibleAvailable = useMemo(() => {
    const images = available?.images ?? [];
    return showAll ? images : images.filter((image) => COMMON_TAGS.has(image.tagId) && !isPreviewApi(image.apiLevel));
  }, [available, showAll]);
  const hiddenCount = (available?.images.length ?? 0) - visibleAvailable.length;

  const groups = useMemo(() => {
    const byVersion = new Map<string, SystemImage[]>();
    for (const image of visibleAvailable) {
      const key = isPreviewApi(image.apiLevel) ? 'Previews' : versionLabel(image.androidVersion, image.apiLevel.replace(/[.-].*$/, ''));
      byVersion.set(key, [...(byVersion.get(key) ?? []), image]);
    }
    return [...byVersion.entries()];
  }, [visibleAvailable]);

  const install = async (image: SystemImage) => {
    try {
      await window.electronAPI.emulators.installImage(image.id);
    } catch (error) {
      toast.error('Could not start the download', { description: emulatorError(error) });
    }
  };

  const answerLicense = async (accept: boolean) => {
    if (!activeJob) return;
    setLicenseBusy(true);
    try {
      await window.electronAPI.emulators.respondToLicense(activeJob.id, accept);
    } catch (error) {
      toast.error('Could not answer the license prompt', { description: emulatorError(error) });
    } finally {
      setLicenseBusy(false);
    }
  };

  const canDownload = !!setup?.canDownload;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs font-medium text-text-muted mb-2">Installed</h3>
        <div className="rounded-lg border border-border-muted bg-surface divide-y divide-border-muted">
          {installed === null ? (
            <div className="h-14 animate-pulse" />
          ) : installed.length === 0 ? (
            <p className="px-4 py-4 text-sm text-text-secondary">
              No system images yet. Download one below; each emulator runs one of them.
            </p>
          ) : (
            installed.map((image) => {
              const used = usage.get(image.id) ?? 0;
              const foreign = setup && !(setup.hostAbi === image.abi || (setup.hostAbi === 'x86_64' && image.abi === 'x86'));
              return (
                <ImageRow
                  key={image.id}
                  image={image}
                  detail={
                    foreign ? (
                      <p className="text-xs text-log-warn mt-0.5">Built for a different CPU; it will be very slow or won’t start here.</p>
                    ) : undefined
                  }
                  trailing={
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-text-muted">
                        {used === 0 ? 'Not used' : `Used by ${used} emulator${used === 1 ? '' : 's'}`}
                      </span>
                      <button
                        type="button"
                        className={buttonStyles.secondary}
                        disabled={!setup?.canCreate || !!foreign}
                        onClick={() => onCreateWithImage(image.id)}
                      >
                        New emulator
                      </button>
                    </div>
                  }
                />
              );
            })
          )}
        </div>
      </section>

      {(activeJob || lastFinished) && (
        <section className="rounded-lg border border-border-muted bg-surface px-4 py-3">
          {activeJob ? (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">Downloading system image</p>
                <p className="text-xs font-mono text-text-muted truncate">{activeJob.packageId}</p>
                <JobProgress job={activeJob} />
              </div>
              <button
                type="button"
                className={buttonStyles.secondary}
                onClick={() => void window.electronAPI.emulators.cancelInstall(activeJob.id)}
              >
                Cancel
              </button>
            </div>
          ) : lastFinished ? (
            <div className="flex items-start gap-3">
              <p className="flex-1 min-w-0 text-sm">
                <span className={lastFinished.phase === 'done' ? 'text-text-primary' : lastFinished.phase === 'failed' ? 'text-log-error' : 'text-text-secondary'}>
                  {lastFinished.phase === 'done' ? 'Downloaded' : lastFinished.message}
                </span>
                <span className="block text-xs font-mono text-text-muted truncate">{lastFinished.packageId}</span>
                {lastFinished.error && <span className="block text-xs text-text-secondary mt-0.5">{lastFinished.error}</span>}
              </p>
              {lastFinished.phase === 'done' && setup?.canCreate && (
                <button type="button" className={buttonStyles.secondary} onClick={() => onCreateWithImage(lastFinished.packageId)}>
                  New emulator
                </button>
              )}
            </div>
          ) : null}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-xs font-medium text-text-muted">Available to download</h3>
          {available && (
            <div className="flex items-center gap-3">
              {(hiddenCount > 0 || showAll) && (
                <button type="button" onClick={() => setShowAll((value) => !value)} className="text-xs text-text-secondary hover:text-text-primary">
                  {showAll ? 'Show common images only' : `Show all (${hiddenCount} more: previews, ATD, TV, Wear…)`}
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadAvailable(true)}
                disabled={loadingAvailable}
                className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                {loadingAvailable ? 'Checking…' : 'Check again'}
              </button>
            </div>
          )}
        </div>

        {!canDownload ? (
          <p className="rounded-lg border border-border-muted bg-surface px-4 py-4 text-sm text-text-secondary">
            Downloading needs sdkmanager (Android SDK Command-line Tools) and Java. See the setup notes above.
          </p>
        ) : !available ? (
          <div className="rounded-lg border border-border-muted bg-surface px-4 py-4 flex items-center gap-4">
            <p className="flex-1 text-sm text-text-secondary">
              {availableError ? (
                <span className="text-log-error">{availableError}</span>
              ) : (
                <>
                  Asks Google’s SDK repository which images exist for this {setup?.hostAbi === 'arm64-v8a' ? 'Apple silicon Mac' : 'computer'}
                  <span className="font-mono text-text-muted"> ({setup?.hostAbi})</span>. Images are 1–3 GB each.
                </>
              )}
            </p>
            <button type="button" className={buttonStyles.secondary} disabled={loadingAvailable} onClick={() => void loadAvailable(false)}>
              {loadingAvailable ? 'Checking…' : availableError ? 'Try again' : 'Show available images'}
            </button>
          </div>
        ) : visibleAvailable.length === 0 ? (
          <p className="rounded-lg border border-border-muted bg-surface px-4 py-4 text-sm text-text-secondary">
            Everything common is already installed.{hiddenCount > 0 ? ' Use “Show all” for previews and other variants.' : ''}
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map(([label, images]) => (
              <div key={label}>
                <p className="text-[11px] text-text-muted mb-1 px-1">{label}</p>
                <div className="rounded-lg border border-border-muted bg-surface divide-y divide-border-muted">
                  {images.map((image) => {
                    const job = activeJob?.packageId === image.id ? activeJob : null;
                    return (
                      <ImageRow
                        key={image.id}
                        image={image}
                        detail={job ? <JobProgress job={job} /> : undefined}
                        trailing={
                          job ? null : (
                            <button
                              type="button"
                              className={buttonStyles.secondary}
                              disabled={!!activeJob}
                              title={activeJob ? 'Wait for the current download to finish' : undefined}
                              onClick={() => void install(image)}
                            >
                              Download
                            </button>
                          )
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={activeJob?.phase === 'license' && !!activeJob.license}
        onClose={() => void answerLicense(false)}
        busy={licenseBusy}
        width="max-w-2xl"
        title="Review the license to continue"
        description={
          <>
            sdkmanager needs you to accept <span className="font-mono text-text-primary">{activeJob?.license?.id}</span> before it
            downloads <span className="font-mono text-text-primary">{activeJob?.packageId}</span>. Android Debugger never accepts
            licenses for you.
          </>
        }
        footer={
          <>
            <button type="button" className={buttonStyles.secondary} disabled={licenseBusy} onClick={() => void answerLicense(false)}>
              Decline
            </button>
            <button type="button" className={buttonStyles.primary} disabled={licenseBusy} onClick={() => void answerLicense(true)}>
              Accept and download
            </button>
          </>
        }
      >
        <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border-muted bg-background px-4 py-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
          {activeJob?.license?.text}
        </div>
      </Dialog>
    </div>
  );
}
