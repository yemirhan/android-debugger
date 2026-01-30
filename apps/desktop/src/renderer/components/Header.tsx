import React from 'react';
import type { Device } from '@android-debugger/shared';
import { PackageSelector } from './PackageSelector';

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

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const DeviceIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
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
  return (
    <header className="h-12 bg-surface border-b border-border flex items-center justify-between px-4 drag-region">
      {/* Left section - macOS traffic lights spacing */}
      <div className="flex items-center gap-3 no-drag pl-16">
        {/* Sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <MenuIcon />
        </button>

        {/* Device selector */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRefreshDevices}
            disabled={loading}
            className={`p-1.5 rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 ${
              loading ? 'animate-spin' : ''
            }`}
            title="Refresh devices"
          >
            <RefreshIcon />
          </button>

          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-background rounded-md border border-border-muted hover:border-border transition-colors">
            <DeviceIcon />
            <select
              value={selectedDevice?.id || ''}
              onChange={(e) => {
                const device = devices.find((d) => d.id === e.target.value);
                if (device) onDeviceSelect(device);
              }}
              className="bg-transparent text-sm text-text-primary outline-none cursor-pointer min-w-[100px] appearance-none pr-4"
              style={{ backgroundImage: 'none' }}
            >
              {devices.length === 0 ? (
                <option value="">No devices</option>
              ) : (
                devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.model}
                  </option>
                ))
              )}
            </select>
            <ChevronDownIcon />
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
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3 no-drag">
        {/* Device connected indicator */}
        {selectedDevice && (
          <div className="flex items-center gap-1.5 px-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
            <span className="text-xs text-text-muted">Connected</span>
          </div>
        )}
      </div>
    </header>
  );
}
