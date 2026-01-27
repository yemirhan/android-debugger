import React from 'react';
import type { Device } from '@android-debugger/shared';
import { PackageSelector } from './PackageSelector';
import { useSdkContext } from '../contexts/SdkContext';

interface HeaderProps {
  devices: Device[];
  selectedDevice: Device | null;
  onDeviceSelect: (device: Device) => void;
  onRefreshDevices: () => void;
  loading: boolean;
  packageName: string;
  onPackageChange: (pkg: string) => void;
}

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const DeviceIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const ServerIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);

export function Header({
  devices,
  selectedDevice,
  onDeviceSelect,
  onRefreshDevices,
  loading,
  packageName,
  onPackageChange,
}: HeaderProps) {
  const { port, setPort, isRunning, startServer, stopServer, connectionCount } = useSdkContext();

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 drag-region">
      <div className="flex items-center gap-3 no-drag pl-16">
        <h1 className="text-sm font-semibold text-text-primary">Android Debugger</h1>
      </div>

      <div className="flex items-center gap-3 no-drag">
        {/* Device selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshDevices}
            disabled={loading}
            className={`p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors ${
              loading ? 'animate-spin' : ''
            }`}
            title="Refresh devices"
          >
            <RefreshIcon />
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover rounded-lg border border-border">
            <DeviceIcon />
            <select
              value={selectedDevice?.id || ''}
              onChange={(e) => {
                const device = devices.find((d) => d.id === e.target.value);
                if (device) onDeviceSelect(device);
              }}
              className="bg-transparent text-sm text-text-primary outline-none cursor-pointer min-w-[120px]"
            >
              {devices.length === 0 ? (
                <option value="">No devices</option>
              ) : (
                devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.model} ({device.androidVersion})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Package selector */}
        {selectedDevice && (
          <PackageSelector
            device={selectedDevice}
            value={packageName}
            onChange={onPackageChange}
          />
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* SDK Server controls */}
        <div className="flex items-center gap-2">
          <ServerIcon />
          {!isRunning && (
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value, 10))}
              className="w-16 px-2 py-1 bg-surface-hover rounded border border-border text-xs text-text-primary outline-none focus:border-violet-500"
              title="WebSocket port"
            />
          )}
          <button
            onClick={isRunning ? stopServer : startServer}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              isRunning
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {isRunning ? 'Stop' : 'Start'}
          </button>
          {isRunning && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-400">:{port}</span>
            </div>
          )}
          {connectionCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <span className="text-xs text-violet-400">
                {connectionCount} SDK
              </span>
            </div>
          )}
        </div>

        {/* Connection status */}
        {selectedDevice && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-400">Connected</span>
          </div>
        )}
      </div>
    </header>
  );
}
