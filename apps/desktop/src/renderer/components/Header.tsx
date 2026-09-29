import React from 'react';
import type { Device } from '@android-debugger/shared';
import { PackageSelector } from './PackageSelector';
import { DevicePicker } from './DevicePicker';

interface HeaderProps {
  devices: Device[];
  selectedDevice: Device | null;
  onDeviceSelect: (device: Device) => void;
  onRefreshDevices: () => void;
  loading: boolean;
  packageName: string;
  onPackageChange: (pkg: string) => void;
  sidebarExpanded: boolean;
  onToggleSidebar: () => void;
}

const SidebarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth={1.5} />
    <path strokeLinecap="round" strokeWidth={1.5} d="M9 4v16" />
  </svg>
);

const WifiIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
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
  sidebarExpanded,
  onToggleSidebar,
}: HeaderProps) {
  const wifiName = selectedDevice?.wifiName?.trim();
  const isReady = selectedDevice?.status === 'device';

  return (
    <header className="h-12 flex-shrink-0 bg-surface border-b border-border-muted flex items-center justify-between gap-4 pr-3 drag-region">
      {/* Left section: leaves room for the macOS traffic lights */}
      <div className="flex items-center gap-2 no-drag pl-[78px] min-w-0">
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <SidebarIcon />
        </button>

        <div className="w-px h-5 bg-border-muted mx-1" />

        <DevicePicker
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceSelect={onDeviceSelect}
          onRefreshDevices={onRefreshDevices}
          loading={loading}
        />

        {isReady && selectedDevice && (
          <PackageSelector
            device={selectedDevice}
            value={packageName}
            onChange={onPackageChange}
          />
        )}
      </div>

      {/* Right section: connection status */}
      <div className="flex items-center gap-4 no-drag flex-shrink-0">
        {isReady && (
          <span
            className="flex items-center gap-1.5 text-xs text-text-muted max-w-[180px]"
            title={wifiName ? `Device Wi-Fi: ${wifiName}` : 'Device is not on Wi-Fi'}
          >
            <WifiIcon />
            <span className={`truncate ${wifiName ? 'text-text-secondary' : ''}`}>{wifiName || 'No Wi-Fi'}</span>
          </span>
        )}
        {isReady && (
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot" />
            Connected
          </span>
        )}
        {selectedDevice && !isReady && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="capitalize">{selectedDevice.status}</span>
          </span>
        )}
      </div>
    </header>
  );
}
