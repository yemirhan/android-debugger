import React, { useEffect, useMemo, useState } from 'react';
import type { DeviceProfile, DeviceProfileCategory, SystemImage } from '../../../main/emulator-types';
import {
  abisForHost,
  defaultDeviceProfile,
  profileCategoriesForTag,
  suggestAvdName,
  validateAvdName,
} from '../../../main/emulator-parsers';
import { useAppSettings } from '../../lib/app-settings';
import { emulatorError, refreshEmulators, startEmulator, useEmulators, versionLabel } from '../../lib/emulators';
import { toast } from '../../lib/toast';
import { Dialog, buttonStyles } from '../shared/Dialog';

interface CreateEmulatorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Preselects an installed image (from System images). */
  initialImageId?: string | null;
  onBrowseImages: () => void;
}

const CATEGORY_LABEL: Record<DeviceProfileCategory, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  wear: 'Wear OS',
  tv: 'TV',
  automotive: 'Automotive',
  desktop: 'Desktop',
  xr: 'XR',
  other: 'Other',
};

const RAM_CHOICES = [0, 2048, 3072, 4096, 6144, 8192];
const STORAGE_CHOICES = [0, 4, 6, 8, 16, 32, 64];
const SD_CHOICES = [0, 512, 1024, 2048, 4096];

const fieldClass =
  'w-full h-8 px-2.5 bg-background rounded-md border border-border-muted text-sm text-text-primary outline-none focus:border-accent transition-colors disabled:opacity-50';

function Label({ htmlFor, children, hint }: { htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-secondary">
        {children}
      </label>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

export function CreateEmulatorDialog({ open, onClose, initialImageId, onBrowseImages }: CreateEmulatorDialogProps) {
  const { setup, avds } = useEmulators();
  const settings = useAppSettings();
  const [images, setImages] = useState<SystemImage[] | null>(null);
  const [profiles, setProfiles] = useState<DeviceProfile[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string>('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [ramMb, setRamMb] = useState(0);
  const [storageGb, setStorageGb] = useState(0);
  const [sdCardMb, setSdCardMb] = useState(0);
  const [startAfter, setStartAfter] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load images and profiles each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setCreating(false);
    setNameEdited(false);
    setImages(null);
    window.electronAPI.emulators
      .getSystemImages()
      .then((list) => !cancelled && setImages(list))
      .catch((reason) => !cancelled && setError(emulatorError(reason)));
    if (!profiles) {
      setProfilesError(null);
      window.electronAPI.emulators
        .getDeviceProfiles()
        .then((list) => !cancelled && setProfiles(list))
        .catch((reason) => !cancelled && setProfilesError(emulatorError(reason)));
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  const hostAbis = setup ? abisForHost(setup.hostAbi) : [];
  const usableImages = useMemo(() => (images ?? []).filter((image) => hostAbis.includes(image.abi)), [images, hostAbis.join()]);
  const otherImages = (images ?? []).length - usableImages.length;
  const image = usableImages.find((candidate) => candidate.id === imageId) ?? null;

  // Pick an image: the requested one, else the newest.
  useEffect(() => {
    if (!open || !images) return;
    const preferred = initialImageId && usableImages.some((candidate) => candidate.id === initialImageId) ? initialImageId : usableImages[0]?.id;
    setImageId((current) => (current && usableImages.some((candidate) => candidate.id === current) && !initialImageId ? current : preferred ?? ''));
  }, [open, images, initialImageId, usableImages]);

  const suitableProfiles = useMemo(() => {
    if (!profiles) return [];
    const categories = profileCategoriesForTag(image?.tagId);
    const matching = profiles.filter((profile) => categories.includes(profile.category));
    return matching.length ? matching : profiles;
  }, [profiles, image?.tagId]);

  // Keep the device valid for the chosen image.
  useEffect(() => {
    if (!suitableProfiles.length) return;
    setDeviceId((current) =>
      suitableProfiles.some((profile) => profile.id === current) ? current : defaultDeviceProfile(suitableProfiles)?.id ?? ''
    );
  }, [suitableProfiles]);

  const device = suitableProfiles.find((profile) => profile.id === deviceId) ?? null;
  const existingNames = avds.map((avd) => avd.name);

  // Suggest a name until the user types one.
  useEffect(() => {
    if (nameEdited || !device) return;
    setName(suggestAvdName(device.name, image?.apiLevel ?? null, existingNames));
  }, [device?.id, image?.id, nameEdited, avds.length]);

  const nameProblem = name ? validateAvdName(name, existingNames) : null;
  const grouped = useMemo(() => {
    const groups = new Map<DeviceProfileCategory, DeviceProfile[]>();
    for (const profile of suitableProfiles) {
      const list = groups.get(profile.category) ?? [];
      list.push(profile);
      groups.set(profile.category, list);
    }
    return [...groups.entries()];
  }, [suitableProfiles]);

  const canSubmit = !!image && !!device && !!name && !nameProblem && !creating && !!setup?.canCreate;

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSubmit || !image || !device) return;
    setCreating(true);
    setError(null);
    try {
      const created = await window.electronAPI.emulators.create({
        name: name.trim(),
        systemImage: image.id,
        device: device.id,
        ramMb: ramMb || undefined,
        storageGb: storageGb || undefined,
        sdCardMb: sdCardMb || undefined,
      });
      await refreshEmulators();
      onClose();
      if (startAfter) {
        void startEmulator(created, { noAudio: settings.emulatorNoAudio });
      } else {
        toast.success(`Created ${created.displayName}`, { description: 'Start it from the list when you need it.' });
      }
    } catch (reason) {
      setError(emulatorError(reason));
      setCreating(false);
    }
  };

  const noImages = images !== null && usableImages.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={creating}
      width="max-w-xl"
      title="Create emulator"
      description="Pick an Android version and a device shape. Everything else has sensible defaults."
      footer={
        <>
          {error && <p className="mr-auto text-xs text-log-error max-w-[60%]">{error}</p>}
          <button type="button" className={buttonStyles.secondary} onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button type="submit" form="create-emulator-form" className={buttonStyles.primary} disabled={!canSubmit}>
            {creating ? 'Creating…' : startAfter ? 'Create and start' : 'Create emulator'}
          </button>
        </>
      }
    >
      <form id="create-emulator-form" onSubmit={submit} className="space-y-5">
        <section>
          <Label hint={images && !noImages ? `${usableImages.length} installed` : undefined}>System image</Label>
          {images === null ? (
            <div className="h-20 rounded-lg border border-border-muted bg-background animate-pulse" />
          ) : noImages ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-4 text-sm">
              <p className="text-text-primary">No system image is installed yet</p>
              <p className="text-text-secondary mt-0.5">
                A system image is the Android version the emulator runs. Download one first
                {otherImages > 0 ? ` (the ${otherImages} installed ${otherImages === 1 ? 'one is' : 'ones are'} for a different CPU)` : ''}.
              </p>
              <button type="button" onClick={onBrowseImages} className={`${buttonStyles.secondary} mt-3`}>
                Browse system images
              </button>
            </div>
          ) : (
            <div role="radiogroup" aria-label="System image" className="rounded-lg border border-border-muted bg-background divide-y divide-border-muted max-h-52 overflow-y-auto">
              {usableImages.map((candidate) => {
                const checked = candidate.id === imageId;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    key={candidate.id}
                    onClick={() => setImageId(candidate.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-offset-[-2px] ${checked ? 'bg-accent-muted' : 'hover:bg-surface-hover'}`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${checked ? 'border-accent' : 'border-border'}`}
                    >
                      {checked && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-text-primary">{versionLabel(candidate.androidVersion, candidate.apiLevel)}</span>
                      <span className="block text-xs text-text-muted truncate">
                        {candidate.tagDisplay} · <span className="font-mono">{candidate.abi}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {!noImages && (
            <p className="mt-1.5 text-xs text-text-muted">
              Need another Android version?{' '}
              <button type="button" onClick={onBrowseImages} className="text-accent hover:underline">
                Download more…
              </button>
            </p>
          )}
        </section>

        <section>
          <Label htmlFor="create-emulator-device">Device</Label>
          {profilesError ? (
            <p className="text-xs text-log-error">{profilesError}</p>
          ) : (
            <select
              id="create-emulator-device"
              value={deviceId}
              disabled={!profiles}
              onChange={(event) => setDeviceId(event.target.value)}
              className={fieldClass}
            >
              {!profiles && <option>Loading device profiles…</option>}
              {grouped.map(([category, list]) => (
                <optgroup key={category} label={CATEGORY_LABEL[category]}>
                  {list.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </section>

        <section>
          <Label htmlFor="create-emulator-name" hint="Letters, digits, . _ -">
            Name
          </Label>
          <input
            id="create-emulator-name"
            data-autofocus
            value={name}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
            }}
            className={`${fieldClass} ${nameProblem ? 'border-log-error/60 focus:border-log-error' : ''}`}
            aria-invalid={!!nameProblem}
            aria-describedby={nameProblem ? 'create-emulator-name-error' : undefined}
          />
          {nameProblem && (
            <p id="create-emulator-name-error" className="mt-1.5 text-xs text-log-error">
              {nameProblem}
            </p>
          )}
        </section>

        <section>
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-expanded={showAdvanced}
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
            Memory and storage
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <Label htmlFor="create-emulator-ram">RAM</Label>
                <select id="create-emulator-ram" value={ramMb} onChange={(event) => setRamMb(Number(event.target.value))} className={fieldClass}>
                  {RAM_CHOICES.map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'Device default' : `${value / 1024} GB`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="create-emulator-storage">Internal storage</Label>
                <select
                  id="create-emulator-storage"
                  value={storageGb}
                  onChange={(event) => setStorageGb(Number(event.target.value))}
                  className={fieldClass}
                >
                  {STORAGE_CHOICES.map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'Image default' : `${value} GB`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="create-emulator-sd">SD card</Label>
                <select id="create-emulator-sd" value={sdCardMb} onChange={(event) => setSdCardMb(Number(event.target.value))} className={fieldClass}>
                  {SD_CHOICES.map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'Default' : value >= 1024 ? `${value / 1024} GB` : `${value} MB`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={startAfter}
            onChange={(event) => setStartAfter(event.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--color-accent)]"
          />
          Start it right away
        </label>
      </form>
    </Dialog>
  );
}
