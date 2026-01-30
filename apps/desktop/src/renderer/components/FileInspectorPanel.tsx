import React, { useState, useEffect } from 'react';
import type { Device } from '@android-debugger/shared';
import { useFileInspector } from '../hooks/useFileInspector';
import { useSharedPreferences } from '../hooks/useSharedPreferences';
import { useDatabaseInspector } from '../hooks/useDatabaseInspector';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface FileInspectorPanelProps {
  device: Device;
  packageName: string;
}

type TabType = 'files' | 'sharedprefs' | 'database';

export function FileInspectorPanel({ device, packageName }: FileInspectorPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('sharedprefs');
  const guide = tabGuides['file-inspector'];

  if (!packageName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-4">
        <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
          <FolderIcon className="w-6 h-6" />
        </div>
        <p className="text-sm">Select a debuggable package to inspect its data</p>
        <p className="text-xs text-text-muted mt-1">Requires a debuggable app</p>
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
          <h2 className="text-base font-semibold">File Inspector</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border-muted">
        {[
          { id: 'sharedprefs' as TabType, label: 'SharedPreferences' },
          { id: 'database' as TabType, label: 'Databases' },
          { id: 'files' as TabType, label: 'Files' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
              activeTab === tab.id
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'sharedprefs' && (
          <SharedPrefsView device={device} packageName={packageName} />
        )}
        {activeTab === 'database' && (
          <DatabaseView device={device} packageName={packageName} />
        )}
        {activeTab === 'files' && (
          <FileBrowserView device={device} packageName={packageName} />
        )}
      </div>
    </div>
  );
}

// SharedPreferences View
function SharedPrefsView({ device, packageName }: { device: Device; packageName: string }) {
  const { preferences, selectedFile, setSelectedFile, selectedPreference, loading, error, refresh } =
    useSharedPreferences(device, packageName);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {preferences.length} preference file{preferences.length !== 1 ? 's' : ''} found
        </p>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 border border-red-500/25 text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        {/* File list */}
        <div className="w-64 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border-muted">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Files</p>
          </div>
          <div className="flex-1 overflow-auto">
            {preferences.map((pref) => (
              <button
                key={pref.file}
                onClick={() => setSelectedFile(pref.file)}
                className={`w-full px-3 py-2 text-left text-sm font-mono truncate transition-colors ${
                  selectedFile === pref.file
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                {pref.file}
              </button>
            ))}
          </div>
        </div>

        {/* Entries */}
        <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border-muted">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Entries ({selectedPreference ? Object.keys(selectedPreference.entries).length : 0})
            </p>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {selectedPreference && Object.keys(selectedPreference.entries).length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-xs uppercase">
                    <th className="text-left p-2">Key</th>
                    <th className="text-left p-2 w-20">Type</th>
                    <th className="text-left p-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedPreference.entries).map(([key, { type, value }]) => (
                    <tr key={key} className="border-t border-border-muted hover:bg-surface-hover">
                      <td className="p-2 font-mono text-text-primary truncate max-w-xs">{key}</td>
                      <td className="p-2 text-text-muted">{type}</td>
                      <td className="p-2 font-mono text-text-secondary truncate max-w-xs">
                        {JSON.stringify(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-text-muted p-4 text-center">
                {selectedPreference ? 'No entries' : 'Select a file to view entries'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Database View
function DatabaseView({ device, packageName }: { device: Device; packageName: string }) {
  const {
    databases,
    selectedDatabase,
    setSelectedDatabase,
    selectedTable,
    selectedDatabaseInfo,
    queryResult,
    customQuery,
    setCustomQuery,
    loading,
    queryLoading,
    error,
    refresh,
    executeQuery,
    loadTableData,
  } = useDatabaseInspector(device, packageName);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={selectedDatabase || ''}
            onChange={(e) => setSelectedDatabase(e.target.value)}
            className="px-3 py-1.5 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="" disabled>
              Select database...
            </option>
            {databases.map((db) => (
              <option key={db.name} value={db.name}>
                {db.name}
              </option>
            ))}
          </select>
          {selectedDatabaseInfo && (
            <span className="text-xs text-text-muted">
              {selectedDatabaseInfo.tables.length} tables
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 border border-red-500/25 text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {selectedDatabaseInfo && (
        <>
          {/* Tables */}
          <div className="flex gap-2 flex-wrap">
            {selectedDatabaseInfo.tables.map((table) => (
              <button
                key={table}
                onClick={() => loadTableData(table)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                  selectedTable === table
                    ? 'bg-accent-muted text-accent'
                    : 'bg-surface text-text-secondary border border-border-muted hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                {table}
              </button>
            ))}
          </div>

          {/* Query Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="SELECT * FROM table_name LIMIT 100"
              className="flex-1 px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && customQuery && executeQuery(customQuery)}
            />
            <button
              onClick={() => customQuery && executeQuery(customQuery)}
              disabled={queryLoading || !customQuery}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-md transition-all duration-150 btn-press disabled:opacity-50"
            >
              {queryLoading ? 'Running...' : 'Run Query'}
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col min-h-0">
            <div className="p-2 border-b border-border-muted flex items-center justify-between">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Results {queryResult ? `(${queryResult.rowCount} rows)` : ''}
              </p>
            </div>
            <div className="flex-1 overflow-auto">
              {queryResult && queryResult.columns.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-text-muted text-xs uppercase">
                      {queryResult.columns.map((col, i) => (
                        <th key={i} className="text-left p-2 border-b border-border-muted">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-t border-border-muted hover:bg-surface-hover">
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className="p-2 font-mono text-text-secondary truncate max-w-xs"
                          >
                            {cell === null ? (
                              <span className="text-text-muted italic">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-text-muted p-4 text-center">
                  Select a table or run a query
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {!selectedDatabaseInfo && databases.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <p className="text-sm">No databases found in this app</p>
        </div>
      )}
    </div>
  );
}

// File Browser View
function FileBrowserView({ device, packageName }: { device: Device; packageName: string }) {
  const {
    currentPath,
    files,
    selectedFile,
    fileContent,
    loading,
    error,
    listFiles,
    navigateTo,
    navigateUp,
    refresh,
  } = useFileInspector(device, packageName);

  useEffect(() => {
    listFiles('');
  }, [device?.id, packageName]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button
          onClick={() => listFiles('')}
          className="text-accent hover:text-accent/80 transition-colors"
        >
          /data/data/{packageName}
        </button>
        {currentPath && currentPath.split('/').map((segment, index, segments) => {
          const pathUpToSegment = segments.slice(0, index + 1).join('/');
          const isLast = index === segments.length - 1;
          return (
            <React.Fragment key={pathUpToSegment}>
              <span className="text-text-muted">/</span>
              {isLast ? (
                <span className="text-text-secondary font-mono">{segment}</span>
              ) : (
                <button
                  onClick={() => listFiles(pathUpToSegment)}
                  className="text-accent hover:text-accent/80 transition-colors font-mono"
                >
                  {segment}
                </button>
              )}
            </React.Fragment>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 border border-red-500/25 text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        {/* File list */}
        <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border-muted flex items-center gap-2">
            {currentPath && (
              <button
                onClick={navigateUp}
                className="p-1 text-text-muted hover:text-text-primary transition-colors"
              >
                <ChevronUpIcon className="w-4 h-4" />
              </button>
            )}
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
              {files.length} items
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => navigateTo(file)}
                className={`w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors ${
                  selectedFile?.path === file.path ? 'bg-accent-muted' : ''
                }`}
              >
                {file.type === 'directory' ? (
                  <FolderIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                ) : (
                  <FileIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                )}
                <span className="flex-1 text-sm font-mono text-text-primary truncate">
                  {file.name}
                </span>
                <span className="text-xs text-text-muted">{formatSize(file.size)}</span>
              </button>
            ))}
            {files.length === 0 && !loading && (
              <p className="text-sm text-text-muted p-4 text-center">Directory is empty</p>
            )}
          </div>
        </div>

        {/* File preview */}
        {selectedFile && (
          <div className="w-1/2 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col">
            <div className="p-2 border-b border-border-muted">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider truncate">
                {selectedFile.name}
              </p>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {fileContent !== null ? (
                <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all">
                  {fileContent}
                </pre>
              ) : loading ? (
                <p className="text-sm text-text-muted">Loading...</p>
              ) : (
                <p className="text-sm text-text-muted">Unable to read file</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Icons
const FolderIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const FileIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const ChevronUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);
