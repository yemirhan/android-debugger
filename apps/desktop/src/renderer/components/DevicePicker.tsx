import React, { useEffect, useRef, useState } from 'react';
import type { Device } from '@android-debugger/shared';

interface DevicePickerProps {
  devices: Device[];
  selectedDevice: Device | null;
  onDeviceSelect: (device: Device) => void;
  onRefreshDevices: () => void;
  loading: boolean;
}

const statusCopy: Record<Device['status'], { label: string; dot: string; hint?: string }> = {
  device: { label: 'Ready', dot: 'bg-signal' },
  unauthorized: {
    label: 'Unauthorized',
    dot: 'bg-amber-400',
    hint: 'Unlock the device and accept the “Allow USB debugging” prompt.',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-red-400',
    hint: 'Reconnect the cable or restart adb, then refresh.',
  },
};

function describe(device: Device): string {
  const parts = [device.id.startsWith('emulator-') ? 'Emulator' : null];
  if (device.androidVersion) parts.push(`Android ${device.androidVersion}`);
  return parts.filter(Boolean).join(', ');
}

const PhoneIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export function DevicePicker({
  devices,
  selectedDevice,
  onDeviceSelect,
  onRefreshDevices,
  loading,
}: DevicePickerProps) {
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

  const status = selectedDevice ? statusCopy[selectedDevice.status] : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-md border bg-background transition-colors max-w-[260px] ${
          open ? 'border-border' : 'border-border-muted hover:border-border'
        }`}
      >
        <span className="relative text-text-muted">
          <PhoneIcon />
          {status && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-background ${status.dot}`}
            />
          )}
        </span>
        <span className="text-sm text-text-primary truncate">
          {selectedDevice ? selectedDevice.model || selectedDevice.id : devices.length === 0 ? 'No device' : 'Choose a device'}
        </span>
        <span className="text-text-muted flex-shrink-0">
          <ChevronIcon />
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-80 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 z-50 animate-pop-in overflow-hidden">
          <div className="flex items-center justify-between px-3 h-9 border-b border-border-muted">
            <span className="text-xs text-text-muted">
              {devices.length === 0 ? 'No devices found' : `${devices.length} connected`}
            </span>
            <button
              onClick={onRefreshDevices}
              disabled={loading}
              className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="px-3 py-4 text-sm text-text-secondary space-y-1.5">
              <p>Plug in an Android device with USB debugging on, or start an emulator.</p>
              <p className="text-xs text-text-muted">
                USB debugging lives in Settings › Developer options. Tap Build number seven times to reveal it.
              </p>
            </div>
          ) : (
            <ul role="listbox" className="p-1 max-h-72 overflow-y-auto">
              {devices.map((device) => {
                const deviceStatus = statusCopy[device.status];
                const isSelected = device.id === selectedDevice?.id;
                return (
                  <li key={device.id}>
                    <button
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onDeviceSelect(device);
                        setOpen(false);
                      }}
                      className={`w-full flex items-start gap-3 px-2.5 py-2 rounded-md text-left transition-colors ${
                        isSelected ? 'bg-accent-muted' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${deviceStatus.dot}`} />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-text-primary truncate">{device.model || device.id}</span>
                          <span className="text-[11px] text-text-muted flex-shrink-0">{deviceStatus.label}</span>
                        </span>
                        <span className="flex gap-2 text-xs text-text-muted min-w-0">
                          {describe(device) && <span className="flex-shrink-0">{describe(device)}</span>}
                          <span className="font-mono truncate">{device.id}</span>
                        </span>
                        {deviceStatus.hint && (
                          <span className="block text-xs text-amber-300/90 mt-1">{deviceStatus.hint}</span>
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
