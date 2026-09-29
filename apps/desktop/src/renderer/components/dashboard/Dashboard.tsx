import React, { useMemo, useState } from 'react';
import type { Device } from '@android-debugger/shared';
import type { TabId } from '../../App';
import { useSdkContext } from '../../contexts/SdkContext';
import { useCrashContext } from '../../contexts/CrashContext';
import { useMemory } from '../../hooks/useMemory';
import { useCpu } from '../../hooks/useCpu';
import { useFps } from '../../hooks/useFps';
import { useBattery } from '../../hooks/useBattery';
import { RecentActivity } from './RecentActivity';
import { Sparkline } from './MiniChart';
import {
  InfoIcon,
  LogsIcon,
  ScreenCaptureIcon,
  ScreenMirrorIcon,
  InstallAppIcon,
} from '../icons';
import { InfoModal } from '../shared/InfoModal';
import { tabGuides } from '../../data/tabGuides';

interface DashboardProps {
  device: Device;
  packageName: string;
  onNavigate: (tab: TabId) => void;
  onRefreshDevices: () => void;
}

interface ReadoutProps {
  label: string;
  value: number | null;
  unit: string;
  color: string;
  history: number[];
  caption?: string;
  onClick: () => void;
  disabled: boolean;
}

function Readout({ label, value, unit, color, history, caption, onClick, disabled }: ReadoutProps) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-surface border border-border-muted rounded-xl p-4 hover:border-border transition-colors flex flex-col min-h-[148px]"
    >
      <div className="w-full flex items-center justify-between">
        <span className="text-[13px] text-text-secondary">{label}</span>
        <span className="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={`text-[32px] leading-none font-semibold font-mono tracking-tight ${
            value === null ? 'text-text-muted' : 'text-text-primary'
          }`}
        >
          {value === null ? '––' : value}
        </span>
        <span className="text-sm text-text-muted">{unit}</span>
      </div>
      {caption && <p className="text-xs text-text-muted mt-1.5">{caption}</p>}
      <div className="w-full mt-auto pt-3 h-[60px]">
        {disabled ? null : <Sparkline data={history} color={color} />}
      </div>
    </button>
  );
}

function batteryCaption(status: string, plugged: string): string {
  if (status === 'charging') return plugged !== 'none' ? `charging over ${plugged === 'wireless' ? 'wireless' : plugged.toUpperCase()}` : 'charging';
  if (status === 'full') return 'full';
  if (plugged !== 'none') return 'plugged in';
  return 'on battery';
}

export function Dashboard({ device, packageName, onNavigate }: DashboardProps) {
  const [showInfo, setShowInfo] = useState(false);
  const { requests } = useSdkContext();
  const { crashes } = useCrashContext();
  const guide = tabGuides['dashboard'];

  const memory = useMemory(device, packageName);
  const cpu = useCpu(device, packageName);
  const fps = useFps(device, packageName);
  const { data: memoryData, current: memoryStats } = memory;
  const { data: cpuData, current: cpuStats } = cpu;
  const { data: fpsData, current: fpsStats } = fps;
  const monitoringStopped = !memory.isMonitoring && !cpu.isMonitoring && !fps.isMonitoring;
  const { current: batteryStats } = useBattery(device);

  const failedRequests = useMemo(
    () => requests.filter((req) => typeof req.status === 'number' && req.status >= 400),
    [requests]
  );

  const memoryHistory = useMemo(() => memoryData.map((d) => d.totalPss / 1024), [memoryData]);
  const cpuHistory = useMemo(() => cpuData.map((d) => d.usage), [cpuData]);
  const fpsHistory = useMemo(() => fpsData.map((d) => d.fps), [fpsData]);

  const hasPackage = packageName.length > 0;
  const isEmulator = device.id.startsWith('emulator-');

  const shortcuts: { tab: TabId; label: string; icon: React.ReactNode }[] = [
    { tab: 'logs', label: 'Logs', icon: <LogsIcon /> },
    { tab: 'screen-capture', label: 'Screenshot or record', icon: <ScreenCaptureIcon /> },
    { tab: 'screen-mirror', label: 'Mirror screen', icon: <ScreenMirrorIcon /> },
    { tab: 'install-app', label: 'Install an APK', icon: <InstallAppIcon /> },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      <div className="max-w-[1200px] mx-auto p-6 space-y-5">
        {/* Device */}
        <section className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-text-primary truncate">{device.model || device.id}</h1>
              <button
                onClick={() => setShowInfo(true)}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="About the dashboard"
                aria-label="About the dashboard"
              >
                <InfoIcon />
              </button>
            </div>
            <p className="text-sm text-text-secondary mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {device.androidVersion && <span>Android {device.androidVersion}</span>}
              {isEmulator && <span>Emulator</span>}
              <span className="font-mono text-text-muted">{device.id}</span>
            </p>
          </div>

          <dl className="flex gap-6 flex-shrink-0 text-right">
            <div>
              <dt className="text-xs text-text-muted">Battery</dt>
              <dd className="text-sm text-text-primary tabular-nums mt-0.5">
                {batteryStats ? (
                  <>
                    <span
                      className={
                        batteryStats.level <= 15 ? 'text-red-400' : batteryStats.level <= 30 ? 'text-amber-400' : ''
                      }
                    >
                      {batteryStats.level}%
                    </span>
                    <span className="text-text-muted"> {batteryCaption(batteryStats.status, batteryStats.plugged)}</span>
                  </>
                ) : (
                  <span className="text-text-muted">Reading…</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Wi-Fi</dt>
              <dd className="text-sm text-text-primary mt-0.5 max-w-[180px] truncate">
                {device.wifiName?.trim() || <span className="text-text-muted">No Wi-Fi</span>}
              </dd>
            </div>
          </dl>
        </section>

        {/* Live readouts */}
        <section>
          {hasPackage && monitoringStopped && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-border-muted bg-surface px-4 py-2.5">
              <p className="flex-1 text-sm text-text-secondary">
                Live monitoring is off because auto-start is disabled in Settings.
              </p>
              <button
                onClick={() => {
                  memory.startMonitoring();
                  cpu.startMonitoring();
                  fps.startMonitoring();
                }}
                className="px-3 h-8 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Start monitoring
              </button>
            </div>
          )}
          {!hasPackage && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-accent/25 bg-accent-muted px-4 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              <p className="text-sm text-text-primary">
                Pick an app in the toolbar to watch its memory, CPU and frame rate live.
              </p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Readout
              label="Memory"
              value={memoryStats ? Math.round(memoryStats.totalPss / 1024) : null}
              unit="MB"
              color="#3ddc84"
              history={memoryHistory}
              caption={memoryStats ? `Java ${Math.round(memoryStats.javaHeap / 1024)} MB, native ${Math.round(memoryStats.nativeHeap / 1024)} MB` : undefined}
              onClick={() => onNavigate('memory')}
              disabled={!hasPackage}
            />
            <Readout
              label="CPU"
              value={cpuStats ? Math.round(cpuStats.usage) : null}
              unit="%"
              color="#f26d6d"
              history={cpuHistory}
              onClick={() => onNavigate('cpu-fps')}
              disabled={!hasPackage}
            />
            <Readout
              label="Frame rate"
              value={fpsStats ? Math.round(fpsStats.fps) : null}
              unit="fps"
              color="#3cc8d8"
              history={fpsHistory}
              caption={
                fpsStats && fpsStats.totalFrames > 0
                  ? `${fpsStats.jankyFrames} of ${fpsStats.totalFrames} frames janky`
                  : undefined
              }
              onClick={() => onNavigate('cpu-fps')}
              disabled={!hasPackage}
            />
          </div>
        </section>

        {/* Problems and shortcuts */}
        <section className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-surface border border-border-muted rounded-xl flex flex-col min-h-[240px] overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-border-muted">
              <h2 className="text-[13px] font-medium text-text-primary">Problems</h2>
              <div className="flex items-center gap-3 text-xs">
                <button
                  onClick={() => onNavigate('crashes')}
                  className={`hover:underline ${crashes.length > 0 ? 'text-red-400' : 'text-text-muted'}`}
                >
                  {crashes.length} {crashes.length === 1 ? 'crash' : 'crashes'}
                </button>
                <button
                  onClick={() => onNavigate('network')}
                  className={`hover:underline ${failedRequests.length > 0 ? 'text-amber-400' : 'text-text-muted'}`}
                >
                  {failedRequests.length} failed {failedRequests.length === 1 ? 'request' : 'requests'}
                </button>
              </div>
            </div>
            <RecentActivity
              crashes={crashes}
              failedRequests={failedRequests}
              onItemClick={(type) => onNavigate(type === 'crash' ? 'crashes' : 'network')}
            />
          </div>

          <div className="bg-surface border border-border-muted rounded-xl overflow-hidden">
            <div className="flex items-center px-4 h-11 border-b border-border-muted">
              <h2 className="text-[13px] font-medium text-text-primary">Shortcuts</h2>
            </div>
            <div className="p-1.5">
              {shortcuts.map((shortcut) => (
                <button
                  key={shortcut.tab}
                  onClick={() => onNavigate(shortcut.tab)}
                  className="w-full flex items-center gap-3 h-10 px-3 rounded-md text-left text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 text-text-muted">{shortcut.icon}</span>
                  <span className="text-[13px]">{shortcut.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
