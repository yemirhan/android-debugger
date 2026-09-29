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
import { RnDevtoolsHost } from './components/rn-devtools/RnDevtoolsPanel';
import { useDevices } from './hooks/useDevices';
import { useBackgroundLogcat } from './hooks/useBackgroundLogcat';
import { useBackgroundMonitoring } from './lib/monitoring/monitors';
import { useNavigationState } from './hooks/useNavigationState';
import { SdkProvider, LogsProvider, CrashProvider, UpdateProvider, useUpdateContext } from './contexts';
import { UpdateAvailableModal } from './components/UpdateAvailableModal';
import { CommandCenter } from './components/CommandCenter';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { getNavItem } from './data/navigation';

const LAST_TARGET_KEY = 'android-debugger-last-target';

interface LastTarget {
  deviceId: string | null;
  /** Last app chosen on each device, keyed by device serial. */
  packages: Record<string, string>;
}

function loadLastTarget(): LastTarget {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_TARGET_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      const packages: Record<string, string> = {};
      if (parsed.packages && typeof parsed.packages === 'object') {
        for (const [id, pkg] of Object.entries(parsed.packages)) {
          if (typeof pkg === 'string') packages[id] = pkg;
        }
      }
      return { deviceId: typeof parsed.deviceId === 'string' ? parsed.deviceId : null, packages };
    }
  } catch {
    // Ignore corrupt state and start fresh
  }
  return { deviceId: null, packages: {} };
}

function saveLastTarget(target: LastTarget) {
  try {
    localStorage.setItem(LAST_TARGET_KEY, JSON.stringify(target));
  } catch {
    // Storage full or unavailable; persistence is best-effort
  }
}

export type TabId = 'dashboard' | 'memory' | 'logs' | 'cpu-fps' | 'network' | 'sdk' | 'settings' | 'app-info' | 'screen-capture' | 'dev-options' | 'file-inspector' | 'intent-tester' | 'battery' | 'crashes' | 'services' | 'network-stats' | 'activity-stack' | 'jobs' | 'alarms' | 'websocket' | 'install-app' | 'bundle-analyzer' | 'thread-monitor' | 'gc-monitor' | 'heap-dump' | 'method-trace' | 'screen-mirror' | 'rn-devtools';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const activeDevice = selectedDevice?.status === 'device' ? selectedDevice : null;
  const [packageName, setPackageName] = useState<string>('');
  const { devices, loading: devicesLoading, refresh: refreshDevices } = useDevices();
  const { setNavigateToSettings } = useUpdateContext();
  const { sidebarExpanded, toggleSidebar, isGroupExpanded, toggleGroup } = useNavigationState(activeTab);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Start logcat in background when device is selected
  // This ensures SDK messages are captured regardless of which panel is active
  useBackgroundLogcat(activeDevice, packageName);
  // Performance monitors (memory, CPU, FPS, battery, network, threads, GC)
  // run app-wide so their history keeps growing on every tab.
  useBackgroundMonitoring(activeDevice, packageName);

  // Register settings navigation for update modal
  useEffect(() => {
    setNavigateToSettings(() => setActiveTab('settings'));
  }, [setNavigateToSettings]);

  // Keep the selection synchronized with refreshed device state, preferring a
  // ready device when the previous target disappears.
  useEffect(() => {
    if (!selectedDevice && devices.length > 0) {
      const { deviceId } = loadLastTarget();
      setSelectedDevice(
        devices.find((device) => device.id === deviceId && device.status === 'device') ??
          devices.find((device) => device.status === 'device') ??
          devices[0]
      );
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

  // Restore the app last used on this device, if it's still installed.
  useEffect(() => {
    const deviceId = selectedDevice?.id ?? null;
    window.electronAPI.setSelectedDevice(deviceId);
    setPackageName('');
    if (!deviceId) return;

    const last = loadLastTarget();
    saveLastTarget({ ...last, deviceId });
    const remembered = last.packages[deviceId];
    if (!remembered) return;

    let cancelled = false;
    window.electronAPI
      .getPackages(deviceId, true)
      .then((packages) => {
        if (!cancelled && packages.includes(remembered)) setPackageName((current) => current || remembered);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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
    if (!selectedDevice) return;
    const last = loadLastTarget();
    const packages = { ...last.packages };
    if (pkg) packages[selectedDevice.id] = pkg;
    else delete packages[selectedDevice.id];
    saveLastTarget({ deviceId: selectedDevice.id, packages });
  }, [selectedDevice]);

  const renderPanel = () => {
    if (activeTab === 'dashboard' && activeDevice) {
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

    // Talks to Metro, not the device; RnDevtoolsHost below renders it and
    // keeps it mounted across tab switches so the debugger session survives.
    if (activeTab === 'rn-devtools') {
      return null;
    }

    if (!activeDevice) {
      return (
        <DeviceNotReady
          device={selectedDevice}
          hasDevices={devices.length > 0}
          onRefresh={refreshDevices}
          refreshing={devicesLoading}
        />
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
        <CrashProvider device={activeDevice}>
          <div className="h-screen flex flex-col bg-background text-text-primary overflow-hidden">
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
                onOpenCommandPalette={() => setPaletteOpen(true)}
              />
              <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
                <div key={activeTab} className="flex-1 flex flex-col overflow-hidden panel-content">
                  <ErrorBoundary label={getNavItem(activeTab)?.label}>
                    {renderPanel()}
                  </ErrorBoundary>
                </div>
                <RnDevtoolsHost active={activeTab === 'rn-devtools'} device={activeDevice} packageName={packageName} />
              </main>
            </div>
          </div>
          <UpdateAvailableModal />
          {/* Command panel (⌘K / ⌘⇧P), global shortcuts and toasts */}
          <CommandCenter
            isOpen={paletteOpen}
            onOpenChange={setPaletteOpen}
            devices={devices}
            selectedDevice={selectedDevice}
            packageName={packageName}
            activeTab={activeTab}
            sidebarExpanded={sidebarExpanded}
            onNavigate={setActiveTab}
            onSelectDevice={handleDeviceSelect}
            onSelectPackage={handlePackageChange}
            onRefreshDevices={refreshDevices}
            onToggleSidebar={toggleSidebar}
          />
        </CrashProvider>
      </LogsProvider>
    </SdkProvider>
  );
}

interface DeviceNotReadyProps {
  device: Device | null;
  hasDevices: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

function DeviceNotReady({ device, hasDevices, onRefresh, refreshing }: DeviceNotReadyProps) {
  const { title, body } = !hasDevices || !device
    ? {
        title: 'Connect an Android device',
        body: 'Plug in a phone with USB debugging turned on, or start an emulator. It shows up here automatically.',
      }
    : device.status === 'unauthorized'
      ? {
          title: `Allow USB debugging on ${device.model || device.id}`,
          body: 'Unlock the device and accept the “Allow USB debugging” prompt. Tick “Always allow” to skip this next time.',
        }
      : {
          title: `${device.model || device.id} is offline`,
          body: 'Reconnect the cable, or run “adb kill-server” and refresh.',
        };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-surface border border-border-muted flex items-center justify-center text-text-muted">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-base font-medium text-text-primary">{title}</p>
        <p className="text-sm text-text-secondary mt-1.5">{body}</p>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-5 px-3.5 h-8 text-sm font-medium rounded-md border border-border bg-surface text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Looking for devices…' : 'Look again'}
        </button>
      </div>
    </div>
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
