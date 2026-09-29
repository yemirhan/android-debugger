import React, { useEffect, useRef, useState } from 'react';
import type { Device } from '@android-debugger/shared';
import { deviceNameMatches, type MetroProbe, type RnDevtoolsTarget } from '../../../main/rn-devtools-protocol';
import { ChevronIcon } from './icons';

/** The app a target belongs to, e.g. "com.example.app". */
export function targetLabel(target: RnDevtoolsTarget): string {
  return target.appId ?? target.title;
}

/**
 * Which runtime the page is ("React Native Bridgeless", "Hermes ABI v6"…).
 * RN 0.81 puts it in `description`; older versions in `title`.
 */
function runtimeLabel(target: RnDevtoolsTarget): string | null {
  const candidates = [target.description, target.title];
  const label = candidates.find(
    (value) => value && value !== target.appId && !(target.appId && value.startsWith(target.appId))
  );
  return label ? label.replace(/\s*\[[^\]]*\]\s*$/, '') : null;
}

export function targetDetail(target: RnDevtoolsTarget): string {
  return [target.deviceName, runtimeLabel(target)].filter(Boolean).join(' · ');
}

interface TargetPickerProps {
  targets: RnDevtoolsTarget[];
  selected: RnDevtoolsTarget | null;
  connected: boolean;
  metroState: MetroProbe['state'] | null;
  device: Device | null;
  packageName: string;
  onSelect: (target: RnDevtoolsTarget) => void;
}

export function TargetPicker({ targets, selected, connected, metroState, device, packageName, onSelect }: TargetPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const dot = selected ? (connected ? 'bg-signal' : 'bg-amber-400') : 'bg-text-muted/50';
  const empty = targets.length === 0 && !selected;

  return (
    <div className="relative min-w-0 flex-shrink" ref={rootRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={empty}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-md border bg-background transition-colors max-w-[420px] min-w-0 overflow-hidden disabled:cursor-default ${
          open ? 'border-border' : 'border-border-muted hover:border-border disabled:hover:border-border-muted'
        }`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
        {selected ? (
          <span className="flex items-baseline gap-2 min-w-0 overflow-hidden">
            <span className="text-sm text-text-primary truncate">{targetLabel(selected)}</span>
            {selected.deviceName && (
              <span className="text-xs text-text-muted truncate hidden lg:inline">{selected.deviceName}</span>
            )}
          </span>
        ) : (
          <span className="text-sm text-text-muted truncate">
            {metroState === null
              ? 'Looking for Metro…'
              : metroState !== 'running'
                ? 'Metro not found'
                : targets.length === 0
                  ? 'No app connected'
                  : 'Choose an app'}
          </span>
        )}
        {!empty && (
          <span className="text-text-muted flex-shrink-0">
            <ChevronIcon />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-96 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 z-50 animate-pop-in overflow-hidden">
          <div className="flex items-center px-3 h-9 border-b border-border-muted">
            <span className="text-xs text-text-muted">
              {targets.length === 0
                ? 'No apps connected to Metro'
                : `${targets.length} debuggable ${targets.length === 1 ? 'target' : 'targets'}`}
            </span>
          </div>
          {targets.length > 0 && (
            <ul role="listbox" className="p-1 max-h-80 overflow-y-auto">
              {targets.map((target) => {
                const isSelected = target.id === selected?.id;
                const onThisDevice = deviceNameMatches(target.deviceName, device?.model);
                const isSelectedApp = !!packageName && target.appId === packageName;
                return (
                  <li key={target.id}>
                    <button
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(target);
                        setOpen(false);
                      }}
                      className={`w-full flex items-start gap-3 px-2.5 py-2 rounded-md text-left transition-colors ${
                        isSelected ? 'bg-accent-muted' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0 bg-signal" />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-text-primary truncate">{targetLabel(target)}</span>
                          {(isSelectedApp || onThisDevice) && (
                            <span className="text-[11px] text-text-muted flex-shrink-0">
                              {isSelectedApp ? 'Selected app' : 'This device'}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-text-muted truncate">{targetDetail(target)}</span>
                        {!target.frontendUrl && (
                          <span className="block text-xs text-amber-300/90 mt-0.5">Legacy debugger, Chrome only</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
