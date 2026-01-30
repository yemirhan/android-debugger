import React, { useState } from 'react';
import type { Device } from '@android-debugger/shared';
import { useAppMetadata } from '../hooks/useAppMetadata';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface AppMetadataPanelProps {
  device: Device;
  packageName: string;
}

export function AppMetadataPanel({ device, packageName }: AppMetadataPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const { metadata, loading, error, refresh } = useAppMetadata(device, packageName);
  const guide = tabGuides['app-metadata'];

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!packageName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-4">
        <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
          <InfoIcon />
        </div>
        <p className="text-sm">Select a package to view app metadata</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">App Metadata</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 border border-red-500/25 text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !metadata && (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-sm">Loading metadata...</span>
          </div>
        </div>
      )}

      {/* Metadata content */}
      {metadata && (
        <div className="flex-1 overflow-auto space-y-4">
          {/* Basic info */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Package Name" value={metadata.packageName} mono />
              <InfoRow label="Version Name" value={metadata.versionName} />
              <InfoRow label="Version Code" value={metadata.versionCode.toString()} />
              <InfoRow
                label="Debuggable"
                value={metadata.isDebuggable ? 'Yes' : 'No'}
                color={metadata.isDebuggable ? 'emerald' : 'text-muted'}
              />
            </div>
          </div>

          {/* SDK info */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              SDK Versions
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Target SDK" value={`API ${metadata.targetSdk}`} />
              <InfoRow label="Min SDK" value={`API ${metadata.minSdk}`} />
            </div>
          </div>

          {/* Install info */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              Installation
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="First Install" value={metadata.firstInstallTime} />
              <InfoRow label="Last Update" value={metadata.lastUpdateTime} />
              <InfoRow label="System App" value={metadata.isSystem ? 'Yes' : 'No'} />
            </div>
          </div>

          {/* Sizes */}
          {(metadata.apkSize > 0 || metadata.dataSize > 0 || metadata.cacheSize > 0) && (
            <div className="bg-surface rounded-lg p-4 border border-border-muted">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
                Storage
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <InfoRow label="APK Size" value={formatBytes(metadata.apkSize)} />
                <InfoRow label="Data Size" value={formatBytes(metadata.dataSize)} />
                <InfoRow label="Cache Size" value={formatBytes(metadata.cacheSize)} />
              </div>
            </div>
          )}

          {/* Permissions */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              Permissions ({metadata.permissions.length})
            </h3>
            {metadata.permissions.length > 0 ? (
              <div className="max-h-48 overflow-auto">
                <div className="flex flex-wrap gap-2">
                  {metadata.permissions.map((permission) => (
                    <span
                      key={permission}
                      className="px-2 py-1 text-xs font-mono bg-surface-hover rounded border border-border-muted text-text-secondary"
                    >
                      {permission.replace('android.permission.', '')}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">No permissions declared</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  color?: 'emerald' | 'blue' | 'amber' | 'red' | 'text-muted';
}

function InfoRow({ label, value, mono, color }: InfoRowProps) {
  const colorClass = color
    ? {
        emerald: 'text-emerald-400',
        blue: 'text-blue-400',
        amber: 'text-amber-400',
        red: 'text-red-400',
        'text-muted': 'text-text-muted',
      }[color]
    : 'text-text-primary';

  return (
    <div>
      <p className="text-xs text-text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${colorClass}`}>{value}</p>
    </div>
  );
}

