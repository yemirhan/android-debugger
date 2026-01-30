import React, { useState, useEffect, useCallback } from 'react';
import type { CrashEntry, Device } from '@android-debugger/shared';
import { MAX_CRASH_ENTRIES } from '@android-debugger/shared';

interface CrashPanelProps {
  device: Device;
}

export function CrashPanel({ device }: CrashPanelProps) {
  const [crashes, setCrashes] = useState<CrashEntry[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [expandedCrash, setExpandedCrash] = useState<string | null>(null);

  const startMonitoring = useCallback(() => {
    if (!device) return;
    window.electronAPI.startCrashLogcat(device.id);
    setIsMonitoring(true);
  }, [device]);

  const stopMonitoring = useCallback(() => {
    window.electronAPI.stopCrashLogcat();
    setIsMonitoring(false);
  }, []);

  const clearCrashes = useCallback(() => {
    setCrashes([]);
    if (device) {
      window.electronAPI.clearCrashLogcat(device.id);
    }
  }, [device]);

  // Listen for crash entries
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCrashEntry((entry: CrashEntry) => {
      setCrashes((prev) => {
        const newCrashes = [...prev, entry];
        if (newCrashes.length > MAX_CRASH_ENTRIES) {
          return newCrashes.slice(-MAX_CRASH_ENTRIES);
        }
        return newCrashes;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Stop monitoring when device changes
  useEffect(() => {
    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, [device?.id, isMonitoring, stopMonitoring]);

  // Auto-start monitoring when device is set
  useEffect(() => {
    if (device && !isMonitoring) {
      startMonitoring();
    }
  }, [device]);

  const toggleExpand = (id: string) => {
    setExpandedCrash(expandedCrash === id ? null : id);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Crash Monitor</h2>
          {crashes.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-500/15 text-red-400 rounded-full">
              {crashes.length} crash{crashes.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearCrashes}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          >
            Clear
          </button>
          <button
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 btn-press ${
              isMonitoring
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
            }`}
          >
            {isMonitoring ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Crash list */}
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden">
        {crashes.length > 0 ? (
          <div className="h-full overflow-y-auto">
            {crashes.map((crash) => (
              <CrashItem
                key={crash.id}
                crash={crash}
                device={device}
                isExpanded={expandedCrash === crash.id}
                onToggle={() => toggleExpand(crash.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm">No crashes detected</p>
            <p className="text-xs text-text-muted mt-1">
              {isMonitoring ? 'Monitoring for crashes...' : 'Start monitoring to detect crashes'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface CrashItemProps {
  crash: CrashEntry;
  device: Device;
  isExpanded: boolean;
  onToggle: () => void;
}

function CrashItem({ crash, device, isExpanded, onToggle }: CrashItemProps) {
  const buildCrashQuery = () => {
    const maxRawLength = 3000;
    const truncatedRaw = crash.raw.length > maxRawLength
      ? crash.raw.slice(0, maxRawLength) + '\n... [truncated]'
      : crash.raw;

    let query = `I have a crash in my Android React Native app.\n\n`;
    query += `Device: ${device.model} (Android ${device.androidVersion})\n\n`;
    query += `Crash output:\n${truncatedRaw}\n\n`;
    query += 'What is causing this crash and how can I fix it?';
    return query;
  };

  const askChatGPT = (e: React.MouseEvent) => {
    e.stopPropagation();
    const query = encodeURIComponent(buildCrashQuery());
    window.electronAPI.openExternal(`https://chatgpt.com/?q=${query}`);
  };

  const askClaude = (e: React.MouseEvent) => {
    e.stopPropagation();
    const query = encodeURIComponent(buildCrashQuery());
    window.electronAPI.openExternal(`https://claude.ai/new?q=${query}`);
  };

  return (
    <div className="border-b border-border-muted last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{crash.processName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-text-muted font-mono">{crash.timestamp}</span>
                {crash.signal && (
                  <span className="text-xs text-red-400 font-mono">
                    {crash.signal}
                  </span>
                )}
                {crash.pid > 0 && (
                  <span className="text-xs text-text-muted font-mono">
                    PID: {crash.pid}
                  </span>
                )}
              </div>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <p className="text-xs text-text-muted mt-2 line-clamp-1">{crash.message}</p>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 animate-fade-in">
          {/* Stack trace */}
          {crash.stackTrace.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Stack Trace</p>
              <div className="bg-background rounded-lg p-3 overflow-x-auto">
                <pre className="text-xs font-mono text-text-secondary">
                  {crash.stackTrace.map((line, i) => (
                    <div key={i} className="py-0.5 hover:bg-surface-hover px-1 -mx-1 rounded">
                      {line}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}

          {/* Raw output */}
          <div className="mt-3">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Raw Output</p>
            <div className="bg-background rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">
              <pre className="text-xs font-mono text-text-muted whitespace-pre-wrap">{crash.raw}</pre>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={askChatGPT}
              className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/15 rounded-md hover:bg-emerald-500/25 transition-all duration-150 btn-press"
            >
              Ask ChatGPT
            </button>
            <button
              onClick={askClaude}
              className="px-3 py-1.5 text-xs font-medium text-orange-400 bg-orange-500/15 rounded-md hover:bg-orange-500/25 transition-all duration-150 btn-press"
            >
              Ask Claude
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(crash.raw);
              }}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-hover rounded-md hover:text-text-primary transition-all duration-150 btn-press"
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
