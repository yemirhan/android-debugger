import React, { useState, useEffect } from 'react';
import { MEMORY_POLL_INTERVAL, CPU_POLL_INTERVAL, FPS_POLL_INTERVAL } from '@android-debugger/shared';

interface AdbInfo {
  path: string;
  version: string;
  source: 'bundled' | 'system' | 'android-sdk';
}

export function SettingsPanel() {
  const [adbInfo, setAdbInfo] = useState<AdbInfo | null>(null);
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
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-5">
      <h2 className="text-base font-semibold">Settings</h2>

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

      {/* About */}
      <section className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">About</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-text-secondary">Version</span>
            <span className="text-sm font-mono text-text-primary">1.0.0</span>
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
