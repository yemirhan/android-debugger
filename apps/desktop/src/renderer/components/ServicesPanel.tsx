import React, { useState, useEffect, useCallback } from 'react';
import type { ServiceInfo, Device } from '@android-debugger/shared';

interface ServicesPanelProps {
  device: Device;
  packageName: string;
}

export function ServicesPanel({ device, packageName }: ServicesPanelProps) {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllPackages, setShowAllPackages] = useState(false);

  const fetchServices = useCallback(async () => {
    if (!device) return;

    setLoading(true);
    try {
      const result = await window.electronAPI.getRunningServices(
        device.id,
        showAllPackages ? undefined : packageName || undefined
      );
      setServices(result);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  }, [device, packageName, showAllPackages]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const getStateColor = (state: string) => {
    switch (state) {
      case 'started':
        return 'text-emerald-400 bg-emerald-500/15';
      case 'bound':
        return 'text-blue-400 bg-blue-500/15';
      case 'started+bound':
        return 'text-violet-400 bg-violet-500/15';
      default:
        return 'text-text-muted bg-surface-hover';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Running Services</h2>
          {services.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
              {services.length} service{services.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showAllPackages}
              onChange={(e) => setShowAllPackages(e.target.checked)}
              className="rounded border-border-muted text-accent focus:ring-accent bg-surface"
            />
            Show all packages
          </label>
          <button
            onClick={fetchServices}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Info message */}
      {!packageName && !showAllPackages && (
        <div className="px-4 py-2.5 rounded-lg text-sm bg-amber-500/15 border border-amber-500/25 text-amber-400">
          Select a package to see its services, or enable "Show all packages"
        </div>
      )}

      {/* Services table */}
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden">
        {services.length > 0 ? (
          <div className="h-full overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface border-b border-border-muted">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Service Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Package
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    State
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    PID
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Clients
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                    Foreground
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {services.map((service, index) => (
                  <tr key={`${service.packageName}-${service.name}-${index}`} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-mono text-text-primary truncate max-w-xs" title={service.name}>
                        {service.name.split('.').pop()}
                      </p>
                      <p className="text-xs font-mono text-text-muted truncate max-w-xs" title={service.name}>
                        {service.name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-text-muted truncate max-w-xs" title={service.packageName}>
                        {service.packageName}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStateColor(service.state)}`}>
                        {service.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-text-secondary">
                        {service.pid > 0 ? service.pid : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-text-secondary">
                        {service.clientCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {service.foreground ? (
                        <span className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                          <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center">
                          <svg className="w-3 h-3 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="text-sm">
              {loading ? 'Loading services...' : 'No running services found'}
            </p>
            {!loading && (packageName || showAllPackages) && (
              <p className="text-xs text-text-muted mt-1">
                The app may not have any active services
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Started</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Bound</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          <span>Started + Bound</span>
        </div>
      </div>
    </div>
  );
}
