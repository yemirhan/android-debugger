import React, { useState, useEffect, useCallback } from 'react';
import type { Device } from '@android-debugger/shared';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/dashboard';
import { MemoryPanel } from './components/MemoryPanel';
import { LogsPanel } from './components/LogsPanel';
import { CpuFpsPanel } from './components/CpuFpsPanel';
import { NetworkPanel } from './components/NetworkPanel';
import { SdkPanel } from './components/SdkPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { AppMetadataPanel } from './components/AppMetadataPanel';
import { ScreenCapturePanel } from './components/ScreenCapturePanel';
import { DevOptionsPanel } from './components/DevOptionsPanel';
import { FileInspectorPanel } from './components/FileInspectorPanel';
import { IntentTesterPanel } from './components/IntentTesterPanel';
import { BatteryPanel } from './components/BatteryPanel';
import { CrashPanel } from './components/CrashPanel';
import { ServicesPanel } from './components/ServicesPanel';
import { NetworkStatsPanel } from './components/NetworkStatsPanel';
import { ActivityStackPanel } from './components/ActivityStackPanel';
import { JobSchedulerPanel } from './components/JobSchedulerPanel';
import { AlarmMonitorPanel } from './components/AlarmMonitorPanel';
import { WebSocketPanel } from './components/WebSocketPanel';
import { AppInstallerPanel } from './components/AppInstallerPanel';
import { useDevices } from './hooks/useDevices';
import { useBackgroundLogcat } from './hooks/useBackgroundLogcat';
import { SdkProvider, LogsProvider, UpdateProvider, useUpdateContext } from './contexts';
import { UpdateAvailableModal } from './components/UpdateAvailableModal';

export type TabId = 'dashboard' | 'memory' | 'logs' | 'cpu-fps' | 'network' | 'sdk' | 'settings' | 'app-info' | 'screen-capture' | 'dev-options' | 'file-inspector' | 'intent-tester' | 'battery' | 'crashes' | 'services' | 'network-stats' | 'activity-stack' | 'jobs' | 'alarms' | 'websocket' | 'install-app';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [packageName, setPackageName] = useState<string>('');
  const { devices, loading: devicesLoading, refresh: refreshDevices } = useDevices();
  const { setNavigateToSettings } = useUpdateContext();

  // Start logcat in background when device is selected
  // This ensures SDK messages are captured regardless of which panel is active
  useBackgroundLogcat(selectedDevice);

  // Register settings navigation for update modal
  useEffect(() => {
    setNavigateToSettings(() => setActiveTab('settings'));
  }, [setNavigateToSettings]);

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
    // Dashboard handles its own "no device" state
    if (activeTab === 'dashboard') {
      return (
        <Dashboard
          device={selectedDevice}
          packageName={packageName}
          onNavigate={setActiveTab}
          onRefreshDevices={refreshDevices}
        />
      );
    }

    // Settings doesn't require a device
    if (activeTab === 'settings') {
      return <SettingsPanel />;
    }

    if (!selectedDevice) {
      return (
        <div className="flex-1 flex items-center justify-center text-text-secondary panel-content">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-hover flex items-center justify-center">
              <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-text-primary mb-1">No Device Connected</p>
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
      case 'app-info':
        return <AppMetadataPanel device={selectedDevice} packageName={packageName} />;
      case 'screen-capture':
        return <ScreenCapturePanel device={selectedDevice} />;
      case 'dev-options':
        return <DevOptionsPanel device={selectedDevice} />;
      case 'file-inspector':
        return <FileInspectorPanel device={selectedDevice} packageName={packageName} />;
      case 'intent-tester':
        return <IntentTesterPanel device={selectedDevice} />;
      case 'battery':
        return <BatteryPanel device={selectedDevice} />;
      case 'crashes':
        return <CrashPanel device={selectedDevice} />;
      case 'services':
        return <ServicesPanel device={selectedDevice} packageName={packageName} />;
      case 'network-stats':
        return <NetworkStatsPanel device={selectedDevice} packageName={packageName} />;
      case 'activity-stack':
        return <ActivityStackPanel device={selectedDevice} packageName={packageName} />;
      case 'jobs':
        return <JobSchedulerPanel device={selectedDevice} packageName={packageName} />;
      case 'alarms':
        return <AlarmMonitorPanel device={selectedDevice} packageName={packageName} />;
      case 'websocket':
        return <WebSocketPanel />;
      case 'install-app':
        return <AppInstallerPanel device={selectedDevice} />;
      default:
        return null;
    }
  };

  return (
    <SdkProvider>
      <LogsProvider selectedDevice={selectedDevice} packageName={packageName}>
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
            <main className="flex-1 flex flex-col overflow-hidden">
              <div key={activeTab} className="flex-1 flex flex-col overflow-hidden panel-content">
                {renderPanel()}
              </div>
            </main>
          </div>
        </div>
        <UpdateAvailableModal />
      </LogsProvider>
    </SdkProvider>
  );
}

function App() {
  return (
    <UpdateProvider>
      <AppContent />
    </UpdateProvider>
  );
}

export default App;
