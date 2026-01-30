import React, { useState, useEffect, useCallback } from 'react';
import { MEMORY_POLL_INTERVAL, CPU_POLL_INTERVAL, FPS_POLL_INTERVAL } from '@android-debugger/shared';
import type { UpdateInfo, UpdateProgress, UpdateSettings } from '@android-debugger/shared';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface AdbInfo {
  path: string;
  version: string;
  source: 'bundled' | 'system' | 'android-sdk';
}

interface BundletoolInfo {
  path: string;
  version: string;
}

interface JavaInfo {
  path: string;
  version: string;
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

export function SettingsPanel() {
  const [showInfo, setShowInfo] = useState(false);
  const [adbInfo, setAdbInfo] = useState<AdbInfo | null>(null);
  const [bundletoolInfo, setBundletoolInfo] = useState<BundletoolInfo | null>(null);
  const [javaInfo, setJavaInfo] = useState<JavaInfo | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateSettings, setUpdateSettings] = useState<UpdateSettings>({
    autoCheckOnStartup: true,
    autoDownload: false,
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    memoryInterval: MEMORY_POLL_INTERVAL,
    cpuInterval: CPU_POLL_INTERVAL,
    fpsInterval: FPS_POLL_INTERVAL,
    memoryWarningThreshold: 300,
    memoryCriticalThreshold: 500,
    maxLogEntries: 10000,
    autoStartLogcat: true,
    autoStartMonitoring: true,
  });

  const updateSetting = (key: keyof typeof settings, value: number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    window.electronAPI.getAdbInfo().then(setAdbInfo);
    window.electronAPI.getBundletoolInfo().then(setBundletoolInfo);
    window.electronAPI.getJavaInfo().then(setJavaInfo);
    window.electronAPI.getAppVersion().then(setAppVersion);
    window.electronAPI.getUpdateSettings().then(setUpdateSettings);
  }, []);

  // Set up update event listeners
  useEffect(() => {
    const unsubChecking = window.electronAPI.onUpdateChecking(() => {
      setUpdateStatus('checking');
      setUpdateError(null);
    });

    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateStatus('available');
      setUpdateInfo(info);
    });

    const unsubNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateStatus('idle');
      setUpdateInfo(null);
    });

    const unsubProgress = window.electronAPI.onUpdateProgress((progress) => {
      setUpdateStatus('downloading');
      setUpdateProgress(progress);
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateStatus('downloaded');
      setUpdateInfo(info);
      setUpdateProgress(null);
    });

    const unsubError = window.electronAPI.onUpdateError((error) => {
      setUpdateStatus('error');
      setUpdateError(error);
    });

    return () => {
      unsubChecking();
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    await window.electronAPI.checkForUpdates();
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    await window.electronAPI.downloadUpdate();
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    await window.electronAPI.installUpdate();
  }, []);

  const handleUpdateSettingsChange = useCallback(async (key: keyof UpdateSettings, value: boolean) => {
    const newSettings = { ...updateSettings, [key]: value };
    setUpdateSettings(newSettings);
    await window.electronAPI.setUpdateSettings(newSettings);
  }, [updateSettings]);

  const guide = tabGuides['settings'];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-5">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">Settings</h2>
        <button
          onClick={() => setShowInfo(true)}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Learn more about this feature"
        >
          <InfoIcon />
        </button>
      </div>

      {/* Monitoring Intervals */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Monitoring Intervals</h3>
        <div className="space-y-4">
          <SettingRow
            label="Memory polling interval"
            description="How often to fetch memory data"
          >
            <NumberInput
              value={settings.memoryInterval}
              onChange={(v) => updateSetting('memoryInterval', v)}
              min={100}
              max={10000}
              step={100}
              suffix="ms"
            />
          </SettingRow>

          <SettingRow
            label="CPU polling interval"
            description="How often to fetch CPU data"
          >
            <NumberInput
              value={settings.cpuInterval}
              onChange={(v) => updateSetting('cpuInterval', v)}
              min={100}
              max={10000}
              step={100}
              suffix="ms"
            />
          </SettingRow>

          <SettingRow
            label="FPS polling interval"
            description="How often to fetch FPS data"
          >
            <NumberInput
              value={settings.fpsInterval}
              onChange={(v) => updateSetting('fpsInterval', v)}
              min={100}
              max={10000}
              step={100}
              suffix="ms"
            />
          </SettingRow>
        </div>
      </section>

      {/* Memory Thresholds */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Memory Thresholds</h3>
        <div className="space-y-4">
          <SettingRow
            label="Warning threshold"
            description="Show warning when memory exceeds this value"
          >
            <NumberInput
              value={settings.memoryWarningThreshold}
              onChange={(v) => updateSetting('memoryWarningThreshold', v)}
              min={0}
              step={50}
              suffix="MB"
            />
          </SettingRow>

          <SettingRow
            label="Critical threshold"
            description="Show critical alert when memory exceeds this value"
          >
            <NumberInput
              value={settings.memoryCriticalThreshold}
              onChange={(v) => updateSetting('memoryCriticalThreshold', v)}
              min={0}
              step={50}
              suffix="MB"
            />
          </SettingRow>
        </div>
      </section>

      {/* Log Settings */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Log Settings</h3>
        <div className="space-y-4">
          <SettingRow
            label="Maximum log entries"
            description="Older entries will be removed when limit is reached"
          >
            <NumberInput
              value={settings.maxLogEntries}
              onChange={(v) => updateSetting('maxLogEntries', v)}
              min={100}
              max={100000}
              step={1000}
            />
          </SettingRow>
        </div>
      </section>

      {/* Behavior */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Behavior</h3>
        <div className="space-y-4">
          <SettingRow
            label="Auto-start logcat"
            description="Start streaming logs when a device is selected"
          >
            <Toggle
              value={settings.autoStartLogcat}
              onChange={(v) => updateSetting('autoStartLogcat', v)}
            />
          </SettingRow>

          <SettingRow
            label="Auto-start monitoring"
            description="Start memory/CPU monitoring when a package is selected"
          >
            <Toggle
              value={settings.autoStartMonitoring}
              onChange={(v) => updateSetting('autoStartMonitoring', v)}
            />
          </SettingRow>
        </div>
      </section>

      {/* Updates */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Updates</h3>
        <div className="space-y-4">
          <SettingRow
            label="Check for updates on startup"
            description="Automatically check when the app launches"
          >
            <Toggle
              value={updateSettings.autoCheckOnStartup}
              onChange={(v) => handleUpdateSettingsChange('autoCheckOnStartup', v)}
            />
          </SettingRow>

          <SettingRow
            label="Download updates automatically"
            description="Download updates in the background when available"
          >
            <Toggle
              value={updateSettings.autoDownload}
              onChange={(v) => handleUpdateSettingsChange('autoDownload', v)}
            />
          </SettingRow>

          {/* Update Status */}
          <div className="pt-2 border-t border-border-muted">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">
                  {updateStatus === 'idle' && 'No updates available'}
                  {updateStatus === 'checking' && 'Checking for updates...'}
                  {updateStatus === 'available' && `Update available: v${updateInfo?.version}`}
                  {updateStatus === 'downloading' && `Downloading: ${updateProgress?.percent.toFixed(0)}%`}
                  {updateStatus === 'downloaded' && `Ready to install: v${updateInfo?.version}`}
                  {updateStatus === 'error' && 'Update check failed'}
                </p>
                {updateStatus === 'error' && updateError && (
                  <p className="text-xs text-red-400 mt-1">{updateError}</p>
                )}
                {updateStatus === 'downloading' && updateProgress && (
                  <div className="mt-2 w-full bg-surface-hover rounded-full h-1.5">
                    <div
                      className="bg-accent h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${updateProgress.percent}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {(updateStatus === 'idle' || updateStatus === 'error') && (
                  <button
                    onClick={handleCheckForUpdates}
                    className="px-3 py-1.5 text-xs bg-surface-hover hover:bg-border-muted rounded-md transition-colors"
                  >
                    Check for Updates
                  </button>
                )}
                {updateStatus === 'checking' && (
                  <button
                    disabled
                    className="px-3 py-1.5 text-xs bg-surface-hover rounded-md opacity-50 cursor-not-allowed"
                  >
                    Checking...
                  </button>
                )}
                {updateStatus === 'available' && (
                  <button
                    onClick={handleDownloadUpdate}
                    className="px-3 py-1.5 text-xs bg-accent hover:bg-accent/80 text-white rounded-md transition-colors"
                  >
                    Download
                  </button>
                )}
                {updateStatus === 'downloading' && (
                  <button
                    disabled
                    className="px-3 py-1.5 text-xs bg-surface-hover rounded-md opacity-50 cursor-not-allowed"
                  >
                    Downloading...
                  </button>
                )}
                {updateStatus === 'downloaded' && (
                  <button
                    onClick={handleInstallUpdate}
                    className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
                  >
                    Restart & Update
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">About</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Version</span>
            <span className="text-sm font-mono text-text-primary">{appVersion || '1.0.0'}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Electron</span>
            <span className="text-sm font-mono text-text-primary">34.0.1</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">React</span>
            <span className="text-sm font-mono text-text-primary">19.0.0</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">ADB</span>
            <span className="text-sm font-mono text-text-primary">
              {adbInfo ? `${adbInfo.version} (${adbInfo.source})` : 'Not found'}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">ADB Path</span>
            <span className="text-xs font-mono text-text-muted truncate max-w-[200px]" title={adbInfo?.path}>
              {adbInfo?.path || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Java</span>
            <span className="text-sm font-mono text-text-primary">
              {javaInfo ? javaInfo.version : 'Not found'}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Java Path</span>
            <span className="text-xs font-mono text-text-muted truncate max-w-[200px]" title={javaInfo?.path}>
              {javaInfo?.path || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Bundletool</span>
            <span className="text-sm font-mono text-text-primary">
              {bundletoolInfo ? `${bundletoolInfo.version}` : 'Not found'}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Bundletool Path</span>
            <span className="text-xs font-mono text-text-muted truncate max-w-[200px]" title={bundletoolInfo?.path}>
              {bundletoolInfo?.path || 'N/A'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

function NumberInput({ value, onChange, min, max, step, suffix }: NumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2.5 py-1.5 bg-background rounded-md border border-border-muted text-sm text-text-primary text-right font-mono outline-none focus:border-accent transition-colors"
      />
      {suffix && <span className="text-xs text-text-muted">{suffix}</span>}
    </div>
  );
}

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ value, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
        value ? 'bg-accent' : 'bg-surface-hover border border-border-muted'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
