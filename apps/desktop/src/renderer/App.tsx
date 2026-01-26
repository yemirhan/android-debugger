import React, { useState, useEffect, useCallback } from 'react';
import type { Device } from '@android-debugger/shared';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MemoryPanel } from './components/MemoryPanel';
import { LogsPanel } from './components/LogsPanel';
import { CpuFpsPanel } from './components/CpuFpsPanel';
import { NetworkPanel } from './components/NetworkPanel';
import { SdkPanel } from './components/SdkPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { useDevices } from './hooks/useDevices';

export type TabId = 'memory' | 'logs' | 'cpu-fps' | 'network' | 'sdk' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('memory');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [packageName, setPackageName] = useState<string>('');
  const { devices, loading: devicesLoading, refresh: refreshDevices } = useDevices();

  // Auto-select first device
  useEffect(() => {
    if (!selectedDevice && devices.length > 0) {
      setSelectedDevice(devices[0]);
    }
  }, [devices, selectedDevice]);

  // Update selected device if it disconnects
  useEffect(() => {
    if (selectedDevice && !devices.find((d) => d.id === selectedDevice.id)) {
      setSelectedDevice(devices[0] || null);
    }
  }, [devices, selectedDevice]);

  const handleDeviceSelect = useCallback((device: Device) => {
    setSelectedDevice(device);
  }, []);

  const handlePackageChange = useCallback((pkg: string) => {
    setPackageName(pkg);
  }, []);

  const renderPanel = () => {
    if (!selectedDevice) {
      return (
        <div className="flex-1 flex items-center justify-center text-text-secondary">
          <div className="text-center">
            <p className="text-xl mb-2">No Device Connected</p>
            <p className="text-sm text-text-muted">Connect an Android device via USB and enable USB debugging</p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'memory':
        return (
          <MemoryPanel
            device={selectedDevice}
            packageName={packageName}
          />
        );
      case 'logs':
        return <LogsPanel device={selectedDevice} />;
      case 'cpu-fps':
        return (
          <CpuFpsPanel
            device={selectedDevice}
            packageName={packageName}
          />
        );
      case 'network':
        return <NetworkPanel />;
      case 'sdk':
        return <SdkPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-text-primary">
      <Header
        devices={devices}
        selectedDevice={selectedDevice}
        onDeviceSelect={handleDeviceSelect}
        onRefreshDevices={refreshDevices}
        loading={devicesLoading}
        packageName={packageName}
        onPackageChange={handlePackageChange}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 flex flex-col overflow-hidden">{renderPanel()}</main>
      </div>
    </div>
  );
}

export default App;
