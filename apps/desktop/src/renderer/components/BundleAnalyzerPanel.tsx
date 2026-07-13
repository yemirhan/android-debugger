import React, { useState, useCallback, useEffect, useMemo, DragEvent, MouseEvent } from 'react';
import type { BundleAnalysis, BundleEntryNode, BundleCategoryKey } from '@android-debugger/shared';
import { useBundleAnalyzer } from '../hooks/useBundleAnalyzer';
import { InfoIcon, ChevronRightIcon, ChevronDownIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

type ViewMode = 'files' | 'libs' | 'dex';

interface ContextTarget {
  name: string;
  path: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextTarget;
}

type ItemContextMenuHandler = (e: MouseEvent, target: ContextTarget) => void;

const MAX_METHOD_REFS = 65536;

const categoryColors: Record<BundleCategoryKey, string> = {
  dex: 'bg-blue-500',
  'native-libs': 'bg-violet-500',
  resources: 'bg-emerald-500',
  assets: 'bg-amber-500',
  other: 'bg-zinc-500',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatPercent(part: number, total: number): string {
  if (total <= 0) return '0%';
  const percent = (part / total) * 100;
  return percent >= 10 ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`;
}

export function BundleAnalyzerPanel() {
  const [showInfo, setShowInfo] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('files');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const { analysis, isAnalyzing, error, selectAndAnalyze, analyzeDroppedFile, reset } =
    useBundleAnalyzer();
  const guide = tabGuides['bundle-analyzer'];

  // Auto-dismiss transient notices
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const openItemContextMenu = useCallback<ItemContextMenuHandler>((e, target) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, target });
  }, []);

  const handleExtract = useCallback(
    async (target: ContextTarget) => {
      if (!analysis) return;
      try {
        const result = await window.electronAPI.extractBundleEntry(analysis.filePath, target.path);
        if (result.success && result.savedPath) {
          setNotice({ kind: 'success', text: `Extracted to ${result.savedPath}` });
        } else if (!result.canceled) {
          setNotice({ kind: 'error', text: result.error || 'Failed to extract file' });
        }
      } catch (err) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to extract file' });
      }
    },
    [analysis]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        setViewMode('files');
        analyzeDroppedFile(file);
      }
    },
    [analyzeDroppedFile]
  );

  const handleSelect = useCallback(() => {
    setViewMode('files');
    selectAndAnalyze();
  }, [selectAndAnalyze]);

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
          <h2 className="text-base font-semibold">Bundle Analyzer</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
        </div>
        {analysis && (
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs font-medium bg-surface-hover hover:bg-surface border border-border-muted text-text-primary rounded-md transition-all duration-150 btn-press"
          >
            Analyze Another File
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg text-sm bg-red-500/15 border border-red-500/25 text-red-400">
          {error}
        </div>
      )}

      {/* Transient notice (e.g. extraction result) */}
      {notice && (
        <div
          className={`px-4 py-3 rounded-lg text-sm animate-fade-in ${
            notice.kind === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
              : 'bg-red-500/15 border border-red-500/25 text-red-400'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Drop zone */}
      {!analysis && !isAnalyzing && (
        <div
          onClick={handleSelect}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            flex-1 bg-surface rounded-lg p-8 border-2 border-dashed transition-all cursor-pointer
            flex flex-col items-center justify-center text-center
            ${isDragOver
              ? 'border-accent bg-accent/10'
              : 'border-border-muted hover:border-text-muted hover:bg-surface-hover'
            }
          `}
        >
          <div className="w-16 h-16 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
            <PackageIcon />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">
            Drop an APK or AAB file here to analyze it
          </p>
          <p className="text-xs text-text-muted mb-4">
            Inspect file sizes, DEX classes and native libraries — like Android Studio's APK Analyzer
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSelect();
            }}
            className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-md transition-all duration-150 btn-press"
          >
            Browse Files
          </button>
        </div>
      )}

      {/* Analyzing */}
      {isAnalyzing && (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3">
          <Spinner className="w-8 h-8" />
          <p className="text-sm">Analyzing bundle...</p>
        </div>
      )}

      {/* Results */}
      {analysis && !isAnalyzing && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <SummaryHeader analysis={analysis} />
          <CategoryBar analysis={analysis} />

          {/* View switcher */}
          <div className="flex items-center gap-1 bg-surface border border-border-muted rounded-lg p-1 self-start">
            <ViewTab label="Files" active={viewMode === 'files'} onClick={() => setViewMode('files')} />
            <ViewTab
              label={`Libraries (${analysis.nativeLibs.reduce((sum, abi) => sum + abi.libs.length, 0)})`}
              active={viewMode === 'libs'}
              onClick={() => setViewMode('libs')}
            />
            <ViewTab
              label={`DEX (${analysis.dexFiles.length})`}
              active={viewMode === 'dex'}
              onClick={() => setViewMode('dex')}
            />
          </div>

          <div className="flex-1 min-h-0 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col">
            {viewMode === 'files' && <FileTreeView analysis={analysis} onItemContextMenu={openItemContextMenu} />}
            {viewMode === 'libs' && <LibrariesView analysis={analysis} onItemContextMenu={openItemContextMenu} />}
            {viewMode === 'dex' && <DexView analysis={analysis} onItemContextMenu={openItemContextMenu} />}
          </div>
        </div>
      )}

      {contextMenu && (
        <BundleContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onExtract={handleExtract}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

const CONTEXT_MENU_WIDTH = 224;

function BundleContextMenu({
  menu,
  onClose,
  onExtract,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onExtract: (target: ContextTarget) => void;
}) {
  const { target } = menu;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    onClose();
  };

  const search = (url: string) => {
    window.electronAPI.openExternal(url);
    onClose();
  };

  // .so names get an "android" hint so search results point at the right ecosystem
  const searchQuery = target.name.endsWith('.so') ? `${target.name} android` : target.name;
  const details = `${target.name} (${target.path}) — raw ${formatSize(target.size)}, download ${formatSize(target.compressedSize)}`;

  const itemCount = target.isDirectory ? 6 : 7;
  const left = Math.min(menu.x, window.innerWidth - CONTEXT_MENU_WIDTH - 8);
  const top = Math.min(menu.y, window.innerHeight - itemCount * 32 - 24);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 bg-surface border border-border rounded-lg shadow-xl py-1 animate-fade-in"
        style={{ left, top, width: CONTEXT_MENU_WIDTH }}
      >
        <div className="px-3 py-1.5 text-xs text-text-muted truncate border-b border-border-muted mb-1" title={target.path}>
          {target.name}
        </div>
        <ContextMenuItem label="Copy Name" onClick={() => copy(target.name)} />
        <ContextMenuItem label="Copy Path" onClick={() => copy(target.path)} />
        <ContextMenuItem label="Copy Details" onClick={() => copy(details)} />
        <div className="my-1 border-t border-border-muted" />
        <ContextMenuItem
          label="Search on Google"
          onClick={() => search(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`)}
        />
        <ContextMenuItem
          label="Search on GitHub"
          onClick={() => search(`https://github.com/search?q=${encodeURIComponent(target.name)}`)}
        />
        {!target.isDirectory && (
          <>
            <div className="my-1 border-t border-border-muted" />
            <ContextMenuItem
              label="Extract File..."
              onClick={() => {
                onClose();
                onExtract(target);
              }}
            />
          </>
        )}
      </div>
    </>
  );
}

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover transition-colors"
    >
      {label}
    </button>
  );
}

function SummaryHeader({ analysis }: { analysis: BundleAnalysis }) {
  const { manifest } = analysis;
  return (
    <div className="bg-surface rounded-lg p-4 border border-border-muted">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
          <PackageIcon className="w-6 h-6 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">{analysis.fileName}</p>
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                analysis.fileType === 'aab'
                  ? 'bg-purple-500/15 text-purple-400'
                  : 'bg-emerald-500/15 text-emerald-400'
              }`}
            >
              {analysis.fileType.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-muted flex-wrap">
            {manifest?.packageName && <span className="font-mono">{manifest.packageName}</span>}
            {manifest?.versionName && (
              <span>
                v{manifest.versionName}
                {manifest.versionCode !== undefined && ` (${manifest.versionCode})`}
              </span>
            )}
            {manifest?.minSdkVersion !== undefined && <span>minSdk {manifest.minSdkVersion}</span>}
            {manifest?.targetSdkVersion !== undefined && <span>targetSdk {manifest.targetSdkVersion}</span>}
            {analysis.modules && analysis.modules.length > 0 && (
              <span>Modules: {analysis.modules.join(', ')}</span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
        <SummaryStat label="File Size" value={formatSize(analysis.fileSize)} />
        <SummaryStat label="Download Size (approx)" value={formatSize(analysis.downloadSize)} />
        <SummaryStat label="Raw Size" value={formatSize(analysis.rawSize)} />
        <SummaryStat label="Classes" value={analysis.totalClassCount.toLocaleString()} />
        <SummaryStat
          label="Method Refs"
          value={analysis.totalMethodRefCount.toLocaleString()}
          warn={analysis.dexFiles.some((dex) => dex.methodRefCount > MAX_METHOD_REFS)}
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-surface-hover rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${warn ? 'text-amber-400' : 'text-text-primary'}`}>
        {value}
      </p>
    </div>
  );
}

function CategoryBar({ analysis }: { analysis: BundleAnalysis }) {
  if (analysis.rawSize <= 0) return null;
  return (
    <div className="bg-surface rounded-lg p-4 border border-border-muted">
      <div className="h-3 rounded-full overflow-hidden flex bg-surface-hover">
        {analysis.categories.map((category) => (
          <div
            key={category.key}
            className={categoryColors[category.key]}
            style={{ width: `${(category.size / analysis.rawSize) * 100}%` }}
            title={`${category.label}: ${formatSize(category.size)}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {analysis.categories.map((category) => (
          <div key={category.key} className="flex items-center gap-1.5 text-xs">
            <span className={`w-2.5 h-2.5 rounded-sm ${categoryColors[category.key]}`} />
            <span className="text-text-secondary">{category.label}</span>
            <span className="text-text-muted">
              {formatSize(category.size)} ({formatPercent(category.size, analysis.rawSize)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        active ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Files view
// ---------------------------------------------------------------------------

function FileTreeView({
  analysis,
  onItemContextMenu,
}: {
  analysis: BundleAnalysis;
  onItemContextMenu: ItemContextMenuHandler;
}) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Expand the largest top-level directory by default
    const largest = analysis.root.children?.find((child) => child.isDirectory);
    return new Set(largest ? [largest.path] : []);
  });

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    const result: { node: BundleEntryNode; depth: number }[] = [];
    const walk = (node: BundleEntryNode, depth: number) => {
      result.push({ node, depth });
      if (node.isDirectory && expandedPaths.has(node.path)) {
        node.children?.forEach((child) => walk(child, depth + 1));
      }
    };
    analysis.root.children?.forEach((child) => walk(child, 0));
    return result;
  }, [analysis, expandedPaths]);

  return (
    <>
      <div className="flex items-center px-3 py-2 border-b border-border-muted text-[10px] uppercase tracking-wider text-text-muted">
        <span className="flex-1">File</span>
        <span className="w-24 text-right">Raw Size</span>
        <span className="w-24 text-right">Download</span>
        <span className="w-40 text-right pr-1">% of Total</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.map(({ node, depth }) => {
          const percent = analysis.rawSize > 0 ? (node.size / analysis.rawSize) * 100 : 0;
          return (
            <div
              key={node.path}
              onClick={node.isDirectory ? () => togglePath(node.path) : undefined}
              onContextMenu={(e) =>
                onItemContextMenu(e, {
                  name: node.name,
                  path: node.path,
                  size: node.size,
                  compressedSize: node.compressedSize,
                  isDirectory: node.isDirectory,
                })
              }
              className={`flex items-center px-3 py-1 text-sm border-b border-border-muted/40 ${
                node.isDirectory ? 'cursor-pointer hover:bg-surface-hover' : 'hover:bg-surface-hover/50'
              }`}
            >
              <div className="flex-1 flex items-center min-w-0" style={{ paddingLeft: `${depth * 16}px` }}>
                <span className="w-4 flex-shrink-0 text-text-muted">
                  {node.isDirectory &&
                    (expandedPaths.has(node.path) ? (
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5" />
                    ))}
                </span>
                <span className="w-5 flex-shrink-0">
                  {node.isDirectory ? <FolderIcon /> : <FileIcon name={node.name} />}
                </span>
                <span className="truncate text-text-primary">{node.name}</span>
              </div>
              <span className="w-24 text-right text-xs text-text-secondary tabular-nums">
                {formatSize(node.size)}
              </span>
              <span className="w-24 text-right text-xs text-text-muted tabular-nums">
                {formatSize(node.compressedSize)}
              </span>
              <div className="w-40 flex items-center justify-end gap-2 pl-3">
                <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                  <div className="h-full bg-accent/70 rounded-full" style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
                <span className="w-10 text-right text-xs text-text-muted tabular-nums">
                  {formatPercent(node.size, analysis.rawSize)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Libraries view
// ---------------------------------------------------------------------------

function LibrariesView({
  analysis,
  onItemContextMenu,
}: {
  analysis: BundleAnalysis;
  onItemContextMenu: ItemContextMenuHandler;
}) {
  if (analysis.nativeLibs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted p-8 text-center">
        No native libraries found in this {analysis.fileType.toUpperCase()}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {analysis.nativeLibs.map((abi) => (
        <div key={abi.abi}>
          <div className="flex items-center justify-between px-3 py-2 bg-surface-hover/60 border-b border-border-muted sticky top-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-primary font-mono">{abi.abi}</span>
              <span className="text-xs text-text-muted">
                {abi.libs.length} {abi.libs.length === 1 ? 'library' : 'libraries'}
              </span>
            </div>
            <span className="text-xs text-text-secondary tabular-nums">
              {formatSize(abi.totalSize)} raw / {formatSize(abi.totalCompressedSize)} compressed
            </span>
          </div>
          {abi.libs.map((lib) => (
            <div
              key={lib.path}
              onContextMenu={(e) =>
                onItemContextMenu(e, {
                  name: lib.name,
                  path: lib.path,
                  size: lib.size,
                  compressedSize: lib.compressedSize,
                  isDirectory: false,
                })
              }
              className="flex items-center px-3 py-1.5 text-sm border-b border-border-muted/40 hover:bg-surface-hover/50"
            >
              <span className="w-5 flex-shrink-0">
                <LibIcon />
              </span>
              <span className="flex-1 truncate font-mono text-xs text-text-primary">{lib.name}</span>
              {lib.bitness && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium mr-3 ${
                    lib.bitness === 64 ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {lib.bitness}-bit
                </span>
              )}
              <span className="w-24 text-right text-xs text-text-secondary tabular-nums">
                {formatSize(lib.size)}
              </span>
              <span className="w-24 text-right text-xs text-text-muted tabular-nums">
                {formatSize(lib.compressedSize)}
              </span>
              <div className="w-32 flex items-center justify-end pl-3">
                <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500/70 rounded-full"
                    style={{ width: `${abi.totalSize > 0 ? Math.min((lib.size / abi.totalSize) * 100, 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DEX view
// ---------------------------------------------------------------------------

function DexView({
  analysis,
  onItemContextMenu,
}: {
  analysis: BundleAnalysis;
  onItemContextMenu: ItemContextMenuHandler;
}) {
  if (analysis.dexFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-text-muted p-8 text-center">
        No DEX files found in this {analysis.fileType.toUpperCase()}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center px-3 py-2 border-b border-border-muted text-[10px] uppercase tracking-wider text-text-muted">
        <span className="flex-1">File</span>
        <span className="w-24 text-right">Size</span>
        <span className="w-24 text-right">Classes</span>
        <span className="w-28 text-right">Method Refs</span>
        <span className="w-24 text-right">Field Refs</span>
        <span className="w-24 text-right">Strings</span>
      </div>
      {analysis.dexFiles.map((dex) => {
        const overLimit = dex.methodRefCount > MAX_METHOD_REFS;
        return (
          <div
            key={dex.path}
            onContextMenu={(e) =>
              onItemContextMenu(e, {
                name: dex.path.split('/').pop() || dex.path,
                path: dex.path,
                size: dex.size,
                compressedSize: dex.compressedSize,
                isDirectory: false,
              })
            }
            className="flex items-center px-3 py-1.5 text-sm border-b border-border-muted/40 hover:bg-surface-hover/50"
          >
            <span className="flex-1 truncate font-mono text-xs text-text-primary">{dex.path}</span>
            <span className="w-24 text-right text-xs text-text-secondary tabular-nums">
              {formatSize(dex.size)}
            </span>
            <span className="w-24 text-right text-xs text-text-secondary tabular-nums">
              {dex.classCount.toLocaleString()}
            </span>
            <span
              className={`w-28 text-right text-xs tabular-nums ${
                overLimit ? 'text-amber-400 font-medium' : 'text-text-secondary'
              }`}
              title={overLimit ? `Exceeds the 64K method reference limit (${MAX_METHOD_REFS.toLocaleString()})` : undefined}
            >
              {dex.methodRefCount.toLocaleString()}
              {overLimit && ' ⚠'}
            </span>
            <span className="w-24 text-right text-xs text-text-secondary tabular-nums">
              {dex.fieldRefCount.toLocaleString()}
            </span>
            <span className="w-24 text-right text-xs text-text-secondary tabular-nums">
              {dex.stringCount.toLocaleString()}
            </span>
          </div>
        );
      })}
      <div className="px-3 py-2 text-xs text-text-muted">
        Each DEX file is limited to 65,536 method references. Files above the limit are highlighted.
      </div>
    </div>
  );
}

// Icons

const PackageIcon = ({ className = 'w-8 h-8 text-text-muted' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
    />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-4 h-4 text-amber-400/80" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
  </svg>
);

const FileIcon = ({ name }: { name: string }) => {
  const lower = name.toLowerCase();
  let color = 'text-text-muted';
  if (lower.endsWith('.dex')) color = 'text-blue-400';
  else if (lower.endsWith('.so')) color = 'text-violet-400';
  else if (lower.endsWith('.arsc') || lower.endsWith('.pb')) color = 'text-emerald-400';
  else if (lower.endsWith('.xml')) color = 'text-cyan-400';
  return (
    <svg className={`w-4 h-4 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
};

const LibIcon = () => (
  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
    />
  </svg>
);

const Spinner = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);
