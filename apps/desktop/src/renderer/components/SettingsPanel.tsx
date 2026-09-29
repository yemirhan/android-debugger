import React, { useState, useEffect, useCallback } from 'react';
import type { UpdateSettings } from '@android-debugger/shared';
import { useUpdateContext } from '../contexts/UpdateContext';
import { useAppSettings, updateAppSettings, SETTING_LIMITS, type AppSettings } from '../lib/app-settings';
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
  // Update state lives in UpdateContext so this panel reflects checks/downloads
  // that happened before it mounted (e.g. arriving via "View in Settings").
  const {
    updateStatus,
    updateInfo,
    updateProgress,
    updateError,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useUpdateContext();
  // Persisted to localStorage and read by the monitor hooks and LogsContext.
  const settings = useAppSettings();

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    updateAppSettings({ [key]: value } as Partial<AppSettings>);
  };

  useEffect(() => {
    const logError = (label: string) => (error: unknown) => console.error(`Failed to load ${label}:`, error);
    window.electronAPI.getAdbInfo().then(setAdbInfo).catch(logError('ADB info'));
    window.electronAPI.getBundletoolInfo().then(setBundletoolInfo).catch(logError('bundletool info'));
    window.electronAPI.getJavaInfo().then(setJavaInfo).catch(logError('Java info'));
    window.electronAPI.getAppVersion().then(setAppVersion).catch(logError('app version'));
    window.electronAPI.getUpdateSettings().then(setUpdateSettings).catch(logError('update settings'));
  }, []);

  const handleCheckForUpdates = checkForUpdates;
  const handleDownloadUpdate = downloadUpdate;
  const handleInstallUpdate = installUpdate;

  const handleUpdateSettingsChange = useCallback(async (key: keyof UpdateSettings, value: boolean) => {
    const previous = updateSettings;
    const newSettings = { ...updateSettings, [key]: value };
    setUpdateSettings(newSettings);
    try {
      await window.electronAPI.setUpdateSettings(newSettings);
    } catch (error) {
      console.error('Failed to save update settings:', error);
      setUpdateSettings(previous);
    }
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
        <h3 className="text-xs font-medium text-text-muted mb-4">Monitoring Intervals</h3>
        <div className="space-y-4">
          <SettingRow
            label="Memory polling interval"
            description="How often to fetch memory data"
          >
            <NumberInput
              value={settings.memoryInterval}
              onChange={(v) => updateSetting('memoryInterval', v)}
              min={SETTING_LIMITS.memoryInterval.min}
              max={SETTING_LIMITS.memoryInterval.max}
              step={250}
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
              min={SETTING_LIMITS.cpuInterval.min}
              max={SETTING_LIMITS.cpuInterval.max}
              step={250}
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
              min={SETTING_LIMITS.fpsInterval.min}
              max={SETTING_LIMITS.fpsInterval.max}
              step={250}
              suffix="ms"
            />
          </SettingRow>
        </div>
      </section>

      {/* Memory Thresholds */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted mb-4">Memory Thresholds</h3>
        <div className="space-y-4">
          <SettingRow
            label="Warning threshold"
            description="Memory panel shows a warning when total PSS exceeds this value"
          >
            <NumberInput
              value={settings.memoryWarningThreshold}
              onChange={(v) => updateSetting('memoryWarningThreshold', v)}
              min={SETTING_LIMITS.memoryWarningThreshold.min}
              max={SETTING_LIMITS.memoryWarningThreshold.max}
              step={50}
              suffix="MB"
            />
          </SettingRow>

          <SettingRow
            label="Critical threshold"
            description="Memory panel shows a critical alert when total PSS exceeds this value"
          >
            <NumberInput
              value={settings.memoryCriticalThreshold}
              onChange={(v) => updateSetting('memoryCriticalThreshold', v)}
              min={SETTING_LIMITS.memoryCriticalThreshold.min}
              max={SETTING_LIMITS.memoryCriticalThreshold.max}
              step={50}
              suffix="MB"
            />
          </SettingRow>
          {settings.memoryWarningThreshold >= settings.memoryCriticalThreshold && (
            <p className="text-xs text-amber-400">
              The warning threshold is not below the critical threshold, so only critical alerts will show.
            </p>
          )}
        </div>
      </section>

      {/* Log Settings */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted mb-4">Log Settings</h3>
        <div className="space-y-4">
          <SettingRow
            label="Maximum log entries"
            description="Older entries will be removed when limit is reached"
          >
            <NumberInput
              value={settings.maxLogEntries}
              onChange={(v) => updateSetting('maxLogEntries', v)}
              min={SETTING_LIMITS.maxLogEntries.min}
              max={SETTING_LIMITS.maxLogEntries.max}
              step={1000}
            />
          </SettingRow>
        </div>
      </section>

      {/* Behavior */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted mb-4">Behavior</h3>
        <div className="space-y-4">
          <SettingRow
            label="Auto-start logcat"
            description="Start streaming the Logs view when a device is selected"
          >
            <Toggle
              value={settings.autoStartLogcat}
              onChange={(v) => updateSetting('autoStartLogcat', v)}
            />
          </SettingRow>

          <SettingRow
            label="Auto-start monitoring"
            description="Collect memory, CPU, FPS, battery, network, thread and GC data in the background as soon as a device or app is selected"
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
        <h3 className="text-xs font-medium text-text-muted mb-4">Updates</h3>
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
                  {updateStatus === 'downloading' && `Downloading: ${(updateProgress?.percent ?? 0).toFixed(0)}%`}
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
        <h3 className="text-xs font-medium text-text-muted mb-4">About</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Version</span>
            <span className="text-sm font-mono text-text-primary">{appVersion || '1.0.0'}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Electron</span>
            <span className="text-sm font-mono text-text-primary">{navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] ?? 'Unknown'}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">React</span>
            <span className="text-sm font-mono text-text-primary">{React.version}</span>
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
  // Edit a local draft and commit on blur/Enter, so intermediate keystrokes
  // (e.g. "5" on the way to "5000") are not clamped mid-typing.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
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
