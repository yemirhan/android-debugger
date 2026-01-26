import React, { useState } from 'react';
import { MEMORY_POLL_INTERVAL, CPU_POLL_INTERVAL, FPS_POLL_INTERVAL } from '@android-debugger/shared';

export function SettingsPanel() {
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

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* Monitoring Intervals */}
      <section className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4">Monitoring Intervals</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Memory polling interval</p>
              <p className="text-xs text-text-muted">How often to fetch memory data</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.memoryInterval}
                onChange={(e) => updateSetting('memoryInterval', parseInt(e.target.value, 10))}
                min={100}
                max={10000}
                step={100}
                className="w-24 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary text-right outline-none focus:border-violet-500"
              />
              <span className="text-sm text-text-muted">ms</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">CPU polling interval</p>
              <p className="text-xs text-text-muted">How often to fetch CPU data</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.cpuInterval}
                onChange={(e) => updateSetting('cpuInterval', parseInt(e.target.value, 10))}
                min={100}
                max={10000}
                step={100}
                className="w-24 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary text-right outline-none focus:border-violet-500"
              />
              <span className="text-sm text-text-muted">ms</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">FPS polling interval</p>
              <p className="text-xs text-text-muted">How often to fetch FPS data</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.fpsInterval}
                onChange={(e) => updateSetting('fpsInterval', parseInt(e.target.value, 10))}
                min={100}
                max={10000}
                step={100}
                className="w-24 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary text-right outline-none focus:border-violet-500"
              />
              <span className="text-sm text-text-muted">ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* Memory Thresholds */}
      <section className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4">Memory Thresholds</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Warning threshold</p>
              <p className="text-xs text-text-muted">Show warning when memory exceeds this value</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.memoryWarningThreshold}
                onChange={(e) => updateSetting('memoryWarningThreshold', parseInt(e.target.value, 10))}
                min={0}
                step={50}
                className="w-24 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary text-right outline-none focus:border-violet-500"
              />
              <span className="text-sm text-text-muted">MB</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Critical threshold</p>
              <p className="text-xs text-text-muted">Show critical alert when memory exceeds this value</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.memoryCriticalThreshold}
                onChange={(e) => updateSetting('memoryCriticalThreshold', parseInt(e.target.value, 10))}
                min={0}
                step={50}
                className="w-24 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary text-right outline-none focus:border-violet-500"
              />
              <span className="text-sm text-text-muted">MB</span>
            </div>
          </div>
        </div>
      </section>

      {/* Log Settings */}
      <section className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4">Log Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Maximum log entries</p>
              <p className="text-xs text-text-muted">Older entries will be removed when limit is reached</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.maxLogEntries}
                onChange={(e) => updateSetting('maxLogEntries', parseInt(e.target.value, 10))}
                min={100}
                max={100000}
                step={1000}
                className="w-24 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary text-right outline-none focus:border-violet-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Behavior */}
      <section className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4">Behavior</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Auto-start logcat</p>
              <p className="text-xs text-text-muted">Start streaming logs when a device is selected</p>
            </div>
            <button
              onClick={() => updateSetting('autoStartLogcat', !settings.autoStartLogcat)}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.autoStartLogcat ? 'bg-violet-500' : 'bg-surface-hover'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.autoStartLogcat ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Auto-start monitoring</p>
              <p className="text-xs text-text-muted">Start memory/CPU monitoring when a package is selected</p>
            </div>
            <button
              onClick={() => updateSetting('autoStartMonitoring', !settings.autoStartMonitoring)}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.autoStartMonitoring ? 'bg-violet-500' : 'bg-surface-hover'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.autoStartMonitoring ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="bg-surface rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4">About</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Version</span>
            <span className="text-text-primary">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Electron</span>
            <span className="text-text-primary">34.0.1</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">React</span>
            <span className="text-text-primary">19.0.0</span>
          </div>
        </div>
      </section>
    </div>
  );
}
