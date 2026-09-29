import { useEffect, useRef, useState } from 'react';
import {
  MIRROR_QUALITY_PRESETS,
  getQualityPreset,
  setMirrorPrefs,
  setMirrorQuality,
  useMirror,
  type MirrorPrefs,
} from '../../lib/mirror/mirror-client';

interface MirrorSettingsMenuProps {
  /** Called after the quality changed (the stream restarts to apply it). */
  onQualityChange: () => void;
  onPrefsChange: () => void;
}

/** Quality presets and device options for the in-app mirror. */
export function MirrorSettingsMenu({ onQualityChange, onPrefsChange }: MirrorSettingsMenuProps) {
  const mirror = useMirror();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const preset = getQualityPreset(mirror.qualityId);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const togglePref = (key: keyof MirrorPrefs) => {
    setMirrorPrefs({ [key]: !mirror.prefs[key] });
    onPrefsChange();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mirror quality and options"
        className={`h-8 pl-2.5 pr-2 inline-flex items-center gap-1.5 rounded-md text-sm whitespace-nowrap border transition-colors ${
          open ? 'border-border bg-surface-hover text-text-primary' : 'border-border-muted text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        <SlidersIcon />
        {preset.label}
        <ChevronIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-64 z-30 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 animate-pop-in p-1"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-xs text-text-muted">Quality</p>
          {MIRROR_QUALITY_PRESETS.map((option) => {
            const selected = option.id === mirror.qualityId;
            return (
              <button
                key={option.id}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  if (!selected) {
                    setMirrorQuality(option.id);
                    onQualityChange();
                  }
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-left text-sm transition-colors ${
                  selected ? 'bg-accent-muted text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <span>{option.label}</span>
                <span className="text-xs text-text-muted">{option.description}</span>
              </button>
            );
          })}

          <div className="my-1 border-t border-border-muted" />
          <p className="px-2.5 pt-1 pb-1 text-xs text-text-muted">While mirroring</p>
          <ToggleRow
            label="Keep the device awake"
            checked={mirror.prefs.stayAwake}
            onChange={() => togglePref('stayAwake')}
          />
          <ToggleRow
            label="Show touches on the device"
            checked={mirror.prefs.showTouches}
            onChange={() => togglePref('showTouches')}
          />
          <p className="px-2.5 pt-1 pb-1.5 text-xs text-text-muted">Changes restart the stream. Device settings are restored when you stop.</p>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onChange}
      className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
    >
      <span>{label}</span>
      <span
        className={`relative w-7 h-4 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-border'}`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

const SlidersIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);
