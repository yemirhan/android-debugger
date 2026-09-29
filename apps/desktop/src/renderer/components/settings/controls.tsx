import React, { useEffect, useState } from 'react';

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

interface NumberInputProps {
  value: number;
  disabled?: boolean;
  /** Accessible name when the visible label is elsewhere. */
  label?: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export function NumberInput({ value, onChange, min, max, step, suffix, disabled, label }: NumberInputProps) {
  // Edit a local draft and commit on blur/Enter, so intermediate keystrokes
  // (e.g. "5" on the way to "5000") are not clamped mid-typing.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        aria-label={label}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2.5 py-1.5 bg-background rounded-md border border-border-muted text-sm text-text-primary text-right font-mono outline-none focus:border-accent disabled:opacity-50 transition-colors"
      />
      {suffix && <span className="text-xs text-text-muted">{suffix}</span>}
    </div>
  );
}

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Accessible name when the visible label is elsewhere. */
  label?: string;
}

export function Toggle({ value, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative shrink-0 w-10 h-5 rounded-full transition-colors duration-200 disabled:opacity-50 ${
        value ? 'bg-accent' : 'bg-surface-hover border border-border-muted'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
