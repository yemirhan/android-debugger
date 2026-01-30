import React, { useMemo, useState } from 'react';
import type { Device } from '@android-debugger/shared';
import type { TabId } from '../../App';
import { useSdkContext } from '../../contexts/SdkContext';
import { useMemory } from '../../hooks/useMemory';
import { useCpu } from '../../hooks/useCpu';
import { useFps } from '../../hooks/useFps';
import { useBattery } from '../../hooks/useBattery';
import { useCrashLogcat } from '../../hooks/useCrashLogcat';
import { QuickStats } from './QuickStats';
import { RecentActivity } from './RecentActivity';
import { QuickActions } from './QuickActions';
import { MiniChart, MiniChartPlaceholder } from './MiniChart';
import { NoDeviceState } from '../shared/EmptyState';
import { InfoIcon } from '../icons';
import { InfoModal } from '../shared/InfoModal';
import { tabGuides } from '../../data/tabGuides';

interface DashboardProps {
  device: Device | null;
  packageName: string;
  onNavigate: (tab: TabId) => void;
  onRefreshDevices: () => void;
}

export function Dashboard({ device, packageName, onNavigate, onRefreshDevices }: DashboardProps) {
  const [showInfo, setShowInfo] = useState(false);
  const { requests, clearConsoleLogs, clearRequests } = useSdkContext();
  const guide = tabGuides['dashboard'];

  // Get memory data (only if package is selected)
  const { data: memoryData, current: memoryStats } = useMemory(
    device || ({ id: '', name: '' } as Device),
    packageName
  );

  // Get CPU data (only if package is selected)
  const { data: cpuData, current: cpuStats } = useCpu(
    device,
    packageName
  );

  // Get FPS data (only if package is selected)
  const { data: fpsData, current: fpsStats } = useFps(
    device,
    packageName
  );

  // Get battery data
  const { current: batteryStats } = useBattery(device || ({ id: '', name: '' } as Device));

  // Get crash data
  const { crashes } = useCrashLogcat(device);

  // Calculate network errors
  const networkErrors = useMemo(() => {
    return requests.filter((req) => req.status && req.status >= 400);
  }, [requests]);

  // Memory history for mini chart
  const memoryHistory = useMemo(() => {
    return memoryData.map((d) => Math.round(d.totalPss / 1024));
  }, [memoryData]);

  // CPU history for mini chart
  const cpuHistory = useMemo(() => {
    return cpuData.map((d) => d.usage);
  }, [cpuData]);

  // FPS history for mini chart
  const fpsHistory = useMemo(() => {
    return fpsData.map((d) => d.fps);
  }, [fpsData]);

  // Handle screenshot
  const handleTakeScreenshot = async () => {
    if (!device) return;
    onNavigate('screen-capture');
  };

  // Handle clear logs
  const handleClearLogs = () => {
    clearConsoleLogs();
    clearRequests();
  };

  // Handle activity item click
  const handleActivityClick = (type: string) => {
    switch (type) {
      case 'crash':
        onNavigate('crashes');
        break;
      case 'network-error':
        onNavigate('network');
        break;
      case 'warning':
        onNavigate('memory');
        break;
    }
  };

  if (!device) {
    return (
      <div className="flex-1 flex items-center justify-center panel-content">
        <NoDeviceState />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto p-4 gap-4">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">Dashboard</h2>
        <button
          onClick={() => setShowInfo(true)}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Learn more about this feature"
        >
          <InfoIcon />
        </button>
      </div>

      {/* Quick Stats Row */}
      <QuickStats
        memoryMB={memoryStats ? Math.round(memoryStats.totalPss / 1024) : undefined}
        cpuPercent={cpuStats?.usage ? Math.round(cpuStats.usage) : undefined}
        fps={fpsStats?.fps}
        crashCount={crashes.length}
        networkErrorCount={networkErrors.length}
        onStatClick={onNavigate}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Recent Activity - Takes 2 columns */}
        <div className="col-span-2">
          <RecentActivity
            crashes={crashes}
            networkErrors={requests}
            memoryWarnings={[]}
            onItemClick={handleActivityClick}
          />
        </div>

        {/* Quick Actions */}
        <div className="col-span-1">
          <QuickActions
            device={device}
            onTakeScreenshot={handleTakeScreenshot}
            onClearLogs={handleClearLogs}
            onRefreshDevice={onRefreshDevices}
          />
        </div>
      </div>

      {/* Mini Charts Grid */}
      <div className="grid grid-cols-4 gap-3">
        {packageName ? (
          <>
            <MiniChart
              data={memoryHistory}
              color="#10b981"
              label="Memory"
              value={memoryStats ? `${Math.round(memoryStats.totalPss / 1024)} MB` : '--'}
            />
            <MiniChart
              data={cpuHistory}
              color="#ef4444"
              label="CPU"
              value={cpuStats ? `${Math.round(cpuStats.usage)}%` : '--'}
            />
            <MiniChart
              data={fpsHistory}
              color="#06b6d4"
              label="FPS"
              value={fpsStats ? fpsStats.fps.toString() : '--'}
            />
          </>
        ) : (
          <>
            <MiniChartPlaceholder label="Memory" message="Select package" />
            <MiniChartPlaceholder label="CPU" message="Select package" />
            <MiniChartPlaceholder label="FPS" message="Select package" />
          </>
        )}
        <div className="bg-surface rounded-lg p-3 border border-border-muted">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted">Battery</span>
            <span
              className="text-sm font-semibold font-mono"
              style={{
                color: batteryStats
                  ? batteryStats.level > 50
                    ? '#10b981'
                    : batteryStats.level > 20
                    ? '#f59e0b'
                    : '#ef4444'
                  : '#71717a',
              }}
            >
              {batteryStats ? `${batteryStats.level}%` : '--'}
            </span>
          </div>
          <div className="h-12 flex items-center justify-center">
            {batteryStats ? (
              <div className="flex items-center gap-2">
                <div className="relative w-12 h-6 bg-surface-hover rounded border border-border-muted overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${
                      batteryStats.level > 50
                        ? 'bg-emerald-500/40'
                        : batteryStats.level > 20
                        ? 'bg-amber-500/40'
                        : 'bg-red-500/40'
                    }`}
                    style={{ width: `${batteryStats.level}%` }}
                  />
                  <div className="absolute right-[-2px] top-1/2 -translate-y-1/2 w-1 h-3 bg-border-muted rounded-r" />
                </div>
                <span className="text-xs text-text-muted">
                  {batteryStats.status === 'Charging' ? 'Charging' : batteryStats.plugged !== 'None' ? 'Plugged' : ''}
                </span>
              </div>
            ) : (
              <span className="text-xs text-text-muted">No data</span>
            )}
          </div>
        </div>
      </div>

      {/* Device Info Footer */}
      <div className="flex items-center justify-between text-xs text-text-muted border-t border-border-muted pt-3">
        <div className="flex items-center gap-4">
          <span>
            <span className="text-text-secondary">Device:</span> {device.name}
          </span>
          {device.model && (
            <span>
              <span className="text-text-secondary">Model:</span> {device.model}
            </span>
          )}
          {packageName && (
            <span>
              <span className="text-text-secondary">Package:</span> {packageName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
          <span>Connected</span>
        </div>
      </div>
    </div>
  );
}
