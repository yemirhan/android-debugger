import React, { useEffect, useRef, useState } from 'react';
import type { Device } from '@android-debugger/shared';
import { DEFAULT_METRO_PORT, parseMetroPort, type MetroProbe } from '../../../main/rn-devtools-protocol';
import { setMetroPort } from '../../hooks/useRnDevtools';
import { ChevronIcon } from './icons';

interface MetroPortButtonProps {
  port: number;
  probe: MetroProbe | null;
  device: Device | null;
  reversed: boolean | null;
  onReverse: () => Promise<{ ok: boolean; error?: string }>;
}

function statusCopy(probe: MetroProbe | null, port: number): { dot: string; text: string } {
  if (!probe) return { dot: 'bg-text-muted/50', text: `Checking port ${port}…` };
  switch (probe.state) {
    case 'running':
      return { dot: 'bg-signal', text: `Metro is running at ${probe.origin}` };
    case 'not-metro':
      return { dot: 'bg-amber-400', text: `Another server is using port ${port}` };
    default:
      return { dot: 'bg-text-muted/50', text: `Nothing is listening on port ${port}` };
  }
}

/** Toolbar chip showing Metro's status; opens a popover to change the port and forward it to the device. */
export function MetroPortButton({ port, probe, device, reversed, onReverse }: MetroPortButtonProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(port));
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(String(port));
    setReverseError(null);
    requestAnimationFrame(() => inputRef.current?.select());
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
  }, [open, port]);

  const parsed = parseMetroPort(draft);
  const status = statusCopy(probe, port);
  const deviceName = device ? device.model || device.id : null;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!parsed) return;
    setMetroPort(parsed);
    setOpen(false);
  };

  const forward = async () => {
    setReversing(true);
    setReverseError(null);
    try {
      const result = await onReverse();
      if (!result.ok) setReverseError(result.error ?? 'adb reverse failed');
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="relative flex-shrink-0" ref={rootRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Metro dev server settings"
        className={`h-8 flex items-center gap-2 pl-2.5 pr-2 rounded-md border bg-background text-sm transition-colors ${
          open ? 'border-border' : 'border-border-muted hover:border-border'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${status.dot}`} />
        <span className="text-text-secondary">Metro</span>
        <span className="font-mono text-text-primary">{port}</span>
        <span className="text-text-muted">
          <ChevronIcon />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Metro settings"
          className="absolute top-full right-0 mt-1.5 w-80 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 z-50 animate-pop-in"
        >
          <form onSubmit={save} className="p-3 space-y-2">
            <label htmlFor="metro-port" className="block text-sm font-medium text-text-primary">
              Metro port
            </label>
            <div className="flex gap-2">
              <input
                id="metro-port"
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                inputMode="numeric"
                spellCheck={false}
                className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-background border border-border-muted focus:border-accent outline-none font-mono text-sm text-text-primary"
              />
              <button
                type="submit"
                disabled={!parsed || parsed === port}
                className="px-3 h-8 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
              >
                Use port
              </button>
            </div>
            <p className="text-xs text-text-muted">
              {parsed || draft === ''
                ? `Expo and the React Native CLI use ${DEFAULT_METRO_PORT} unless you start them with --port.`
                : 'Enter a port between 1 and 65535.'}
            </p>
            <p className="flex items-center gap-2 text-xs text-text-secondary pt-1">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.dot}`} />
              <span className="truncate">{status.text}</span>
            </p>
          </form>

          {device && (
            <div className="border-t border-border-muted p-3 space-y-2">
              <p className="text-sm font-medium text-text-primary">Device access</p>
              <p className="text-xs text-text-muted">
                {deviceName} reaches Metro on this computer through <span className="font-mono">adb reverse</span> when it’s
                connected over USB. Emulators usually don’t need it.
              </p>
              {reversed ? (
                <p className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal" />
                  Port <span className="font-mono">{port}</span> is forwarded to {deviceName}
                </p>
              ) : (
                <button
                  onClick={forward}
                  disabled={reversing}
                  className="w-full px-3 h-8 text-sm font-medium rounded-md border border-border bg-surface text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
                >
                  {reversing ? 'Forwarding…' : `Forward port ${port} to the device`}
                </button>
              )}
              {reverseError && <p className="text-xs text-log-error">{reverseError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
