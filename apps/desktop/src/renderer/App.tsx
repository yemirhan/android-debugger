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
import { BundleAnalyzerPanel } from './components/BundleAnalyzerPanel';
import { ThreadMonitorPanel } from './components/ThreadMonitorPanel';
import { GcMonitorPanel } from './components/GcMonitorPanel';
import { HeapDumpPanel } from './components/HeapDumpPanel';
import { MethodTracePanel } from './components/MethodTracePanel';
import { ScreenMirrorPanel } from './components/ScreenMirrorPanel';
import { useDevices } from './hooks/useDevices';
import { useBackgroundLogcat } from './hooks/useBackgroundLogcat';
import { useNavigationState } from './hooks/useNavigationState';
import { SdkProvider, LogsProvider, UpdateProvider, useUpdateContext } from './contexts';
import { UpdateAvailableModal } from './components/UpdateAvailableModal';

export type TabId = 'dashboard' | 'memory' | 'logs' | 'cpu-fps' | 'network' | 'sdk' | 'settings' | 'app-info' | 'screen-capture' | 'dev-options' | 'file-inspector' | 'intent-tester' | 'battery' | 'crashes' | 'services' | 'network-stats' | 'activity-stack' | 'jobs' | 'alarms' | 'websocket' | 'install-app' | 'bundle-analyzer' | 'thread-monitor' | 'gc-monitor' | 'heap-dump' | 'method-trace' | 'screen-mirror';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const activeDevice = selectedDevice?.status === 'device' ? selectedDevice : null;
  const [packageName, setPackageName] = useState<string>('');
  const { devices, loading: devicesLoading, refresh: refreshDevices } = useDevices();
  const { setNavigateToSettings } = useUpdateContext();
  const { sidebarExpanded, toggleSidebar, isGroupExpanded, toggleGroup } = useNavigationState(activeTab);

  // Start logcat in background when device is selected
  // This ensures SDK messages are captured regardless of which panel is active
  useBackgroundLogcat(activeDevice, packageName);

  // Register settings navigation for update modal
  useEffect(() => {
    setNavigateToSettings(() => setActiveTab('settings'));
  }, [setNavigateToSettings]);

  // Keep the selection synchronized with refreshed device state, preferring a
  // ready device when the previous target disappears.
  useEffect(() => {
    if (!selectedDevice && devices.length > 0) {
      setSelectedDevice(devices.find((device) => device.status === 'device') ?? devices[0]);
      return;
    }
    if (!selectedDevice) return;
    const latest = devices.find((device) => device.id === selectedDevice.id);
    if (!latest) {
      setSelectedDevice(devices.find((device) => device.status === 'device') ?? devices[0] ?? null);
    } else if (
      latest.status !== selectedDevice.status ||
      latest.model !== selectedDevice.model ||
      latest.androidVersion !== selectedDevice.androidVersion ||
      latest.wifiName !== selectedDevice.wifiName
    ) {
      setSelectedDevice(latest);
    }
  }, [devices, selectedDevice]);

  useEffect(() => {
    window.electronAPI.setSelectedDevice(selectedDevice?.id ?? null);
    setPackageName('');
  }, [selectedDevice?.id]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onAppNavigate((tabId) => {
      setActiveTab(tabId as TabId);
    });

    return () => {
      unsubscribe();
    };
  }, []);

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
          device={activeDevice}
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

    // Bundle Analyzer works on local APK/AAB files, no device needed
    if (activeTab === 'bundle-analyzer') {
      return <BundleAnalyzerPanel />;
    }

    if (!activeDevice) {
      return (
        <div className="flex-1 flex items-center justify-center text-text-secondary panel-content">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-hover flex items-center justify-center">
              <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-text-primary mb-1">Device Not Ready</p>
            <p className="text-sm text-text-muted">Connect and authorize an Android device with USB debugging enabled</p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'memory':
        return (
          <MemoryPanel
            device={activeDevice}
            packageName={packageName}
          />
        );
      case 'logs':
        return <LogsPanel device={activeDevice} packageName={packageName} />;
      case 'cpu-fps':
        return (
          <CpuFpsPanel
            device={activeDevice}
            packageName={packageName}
          />
        );
      case 'network':
        return <NetworkPanel />;
      case 'sdk':
        return <SdkPanel />;
      case 'app-info':
        return <AppMetadataPanel device={activeDevice} packageName={packageName} />;
      case 'screen-capture':
        return <ScreenCapturePanel device={activeDevice} />;
      case 'dev-options':
        return <DevOptionsPanel device={activeDevice} />;
      case 'file-inspector':
        return <FileInspectorPanel device={activeDevice} packageName={packageName} />;
      case 'intent-tester':
        return <IntentTesterPanel device={activeDevice} />;
      case 'battery':
        return <BatteryPanel device={activeDevice} />;
      case 'crashes':
        return <CrashPanel device={activeDevice} />;
      case 'services':
        return <ServicesPanel device={activeDevice} packageName={packageName} />;
      case 'network-stats':
        return <NetworkStatsPanel device={activeDevice} packageName={packageName} />;
      case 'activity-stack':
        return <ActivityStackPanel device={activeDevice} packageName={packageName} />;
      case 'jobs':
        return <JobSchedulerPanel device={activeDevice} packageName={packageName} />;
      case 'alarms':
        return <AlarmMonitorPanel device={activeDevice} packageName={packageName} />;
      case 'websocket':
        return <WebSocketPanel />;
      case 'install-app':
        return <AppInstallerPanel device={activeDevice} />;
      case 'thread-monitor':
        return <ThreadMonitorPanel device={activeDevice} packageName={packageName} />;
      case 'gc-monitor':
        return <GcMonitorPanel device={activeDevice} packageName={packageName} />;
      case 'heap-dump':
        return <HeapDumpPanel device={activeDevice} packageName={packageName} />;
      case 'method-trace':
        return <MethodTracePanel device={activeDevice} packageName={packageName} />;
      case 'screen-mirror':
        return <ScreenMirrorPanel device={activeDevice} />;
      default:
        return null;
    }
  };

  return (
    <SdkProvider sessionKey={`${activeDevice?.id ?? ''}:${packageName}`}>
      <LogsProvider selectedDevice={activeDevice} packageName={packageName}>
        <div className="h-screen flex flex-col bg-background text-text-primary">
          <Header
            devices={devices}
            selectedDevice={selectedDevice}
            onDeviceSelect={handleDeviceSelect}
            onRefreshDevices={refreshDevices}
            loading={devicesLoading}
            packageName={packageName}
            onPackageChange={handlePackageChange}
            sidebarExpanded={sidebarExpanded}
            onToggleSidebar={toggleSidebar}
          />
          <div className="flex-1 flex min-h-0">
            <Sidebar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              sidebarExpanded={sidebarExpanded}
              isGroupExpanded={isGroupExpanded}
              toggleGroup={toggleGroup}
            />
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
