import React, { useEffect, useMemo, useState } from 'react';
import type {
  Device,
  HeapAnalysis,
  HeapCaptureAutomation,
  HeapClass,
  HeapClassDelta,
  HeapDumpInfo,
} from '@android-debugger/shared';
import { useHeapDump } from '../hooks/useHeapDump';
import { buildHeapLeakReport } from '../lib/heap-comparison';
import { HeapIcon } from './icons';

interface HeapDumpPanelProps {
  device: Device;
  packageName: string;
}

type ResultFilter = 'suspects' | 'growing' | 'app' | 'all';
type ResultSort = 'score' | 'instanceDelta' | 'shallowSizeDelta' | 'name';
type ViewMode = 'leak-check' | 'snapshot';

function formatBytes(bytes: number): string {
  const absolute = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';
  if (absolute < 1024) return `${sign}${absolute}B`;
  if (absolute < 1024 * 1024) return `${sign}${(absolute / 1024).toFixed(1)}KB`;
  if (absolute < 1024 * 1024 * 1024) return `${sign}${(absolute / (1024 * 1024)).toFixed(1)}MB`;
  return `${sign}${(absolute / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function signedNumber(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`;
}

function signedBytes(value: number): string {
  return `${value > 0 ? '+' : ''}${formatBytes(value)}`;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function confidenceClass(confidence: HeapClassDelta['confidence']): string {
  if (confidence === 'high') return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (confidence === 'medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-text-muted bg-surface-hover border-border-muted';
}

export function HeapDumpPanel({ device, packageName }: HeapDumpPanelProps) {
  const {
    dumps,
    selectedDump,
    analysis,
    selectedClass,
    session,
    liveMemoryPssKb,
    isCapturing,
    isAnalyzing,
    error,
    captureDump,
    selectDump,
    selectClass,
    clearDumps,
    clearError,
    startSession,
    markIteration,
    captureCheckpoint,
    finishSession,
    cancelSession,
  } = useHeapDump(device, packageName);

  const [viewMode, setViewMode] = useState<ViewMode>('leak-check');
  const [showSetup, setShowSetup] = useState(true);
  const [scenarioName, setScenarioName] = useState('Repeat the suspected workflow');
  const [automation, setAutomation] = useState<HeapCaptureAutomation>('manual');
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [thresholdMb, setThresholdMb] = useState(20);
  const [maxSnapshots, setMaxSnapshots] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [resultFilter, setResultFilter] = useState<ResultFilter>('suspects');
  const [resultSort, setResultSort] = useState<ResultSort>('score');
  const [searchTerm, setSearchTerm] = useState('');
  const [rawSort, setRawSort] = useState<'name' | 'instanceCount' | 'shallowSize'>('shallowSize');
  const [rawSortDirection, setRawSortDirection] = useState<'asc' | 'desc'>('desc');

  const busy = isCapturing || isAnalyzing;
  const sessionActive = Boolean(session && session.phase !== 'complete' && session.phase !== 'error');

  useEffect(() => {
    if (!sessionActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [sessionActive]);

  useEffect(() => {
    if (session?.phase === 'complete') {
      setViewMode('leak-check');
      setShowSetup(false);
      setResultFilter('suspects');
    }
  }, [session?.phase]);

  const resultClasses = useMemo(() => {
    const comparison = session?.comparison;
    if (!comparison) return [];
    let values = resultFilter === 'suspects'
      ? comparison.suspects
      : comparison.classes.filter((item) => {
          if (resultFilter === 'growing') return item.instanceDelta > 0 || item.shallowSizeDelta > 0;
          if (resultFilter === 'app') return item.appOwned;
          return true;
        });
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      values = values.filter((item) => item.name.toLowerCase().includes(search));
    }
    return [...values].sort((left, right) => {
      if (resultSort === 'name') return left.name.localeCompare(right.name);
      return right[resultSort] - left[resultSort];
    });
  }, [session?.comparison, resultFilter, resultSort, searchTerm]);

  const rawClasses = useMemo(() => {
    if (!analysis) return [];
    const search = searchTerm.toLowerCase();
    return analysis.classes
      .filter((heapClass) => !search || heapClass.name.toLowerCase().includes(search))
      .sort((left, right) => {
        const comparison = rawSort === 'name'
          ? left.name.localeCompare(right.name)
          : left[rawSort] - right[rawSort];
        return rawSortDirection === 'asc' ? comparison : -comparison;
      })
      .slice(0, 1_000);
  }, [analysis, rawSort, rawSortDirection, searchTerm]);

  const handleRawSort = (column: typeof rawSort) => {
    if (rawSort === column) setRawSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else {
      setRawSort(column);
      setRawSortDirection(column === 'name' ? 'asc' : 'desc');
    }
  };

  const handleStart = () => {
    setShowSetup(false);
    setViewMode('leak-check');
    void startSession({ name: scenarioName, automation, intervalSeconds, thresholdMb, maxSnapshots });
  };

  const handleExport = async () => {
    if (!session?.comparison) return;
    const report = buildHeapLeakReport(session, packageName);
    await window.electronAPI.exportHeapReport(report, session.name);
  };

  if (!packageName) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-hover flex items-center justify-center"><HeapIcon /></div>
          <p className="text-sm">Select a package to start a leak investigation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-base font-semibold whitespace-nowrap">Heap Leak Check</h2>
          {session && (
            <span className="px-2 py-0.5 text-xs font-medium bg-surface-hover text-text-secondary rounded-full truncate">
              {session.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dumps.length > 0 && (
            <button
              type="button"
              onClick={() => void clearDumps()}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover disabled:opacity-50"
            >
              Clear
            </button>
          )}
          {!sessionActive && (
            <button
              type="button"
              onClick={() => { setShowSetup(true); setViewMode('leak-check'); }}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50"
            >
              New Leak Check
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="px-4 py-2.5 rounded-lg text-sm bg-red-500/15 border border-red-500/25 text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={clearError} className="px-2 text-red-400 hover:text-red-300">Dismiss</button>
        </div>
      )}

      <div className="px-4 py-2.5 rounded-lg text-sm bg-amber-500/10 border border-amber-500/20 text-amber-300">
        Heap dumps briefly pause the target app. A leak check captures a baseline and final snapshot automatically; class growth is a lead to investigate, not proof by itself.
      </div>

      {showSetup && !sessionActive && (
        <section aria-labelledby="leak-check-setup" className="rounded-xl border border-border-muted bg-surface p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-xl">
              <h3 id="leak-check-setup" className="text-sm font-semibold text-text-primary">Describe what you are testing</h3>
              <p className="text-xs text-text-muted mt-1">We will capture the baseline now. Reproduce the workflow, mark each repetition, then finish for an automatic comparison.</p>
            </div>
            <span className="text-xs text-text-muted">2–5 snapshots recommended</span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
            <label className="col-span-2 text-xs text-text-secondary">
              Scenario
              <input
                value={scenarioName}
                onChange={(event) => setScenarioName(event.target.value)}
                className="mt-1.5 w-full px-3 py-2 text-sm bg-background rounded-md border border-border-muted text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Open and close the details screen"
              />
            </label>
            <label className="text-xs text-text-secondary">
              Automatic checkpoints
              <select
                value={automation}
                onChange={(event) => setAutomation(event.target.value as HeapCaptureAutomation)}
                className="mt-1.5 w-full px-3 py-2 text-sm bg-background rounded-md border border-border-muted text-text-primary"
              >
                <option value="manual">Start and finish only</option>
                <option value="interval">Every interval</option>
                <option value="memory-threshold">On memory growth</option>
              </select>
            </label>
            <label className="text-xs text-text-secondary">
              {automation === 'interval' ? 'Interval' : automation === 'memory-threshold' ? 'Growth threshold' : 'Maximum snapshots'}
              {automation === 'interval' ? (
                <select value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))} className="mt-1.5 w-full px-3 py-2 text-sm bg-background rounded-md border border-border-muted text-text-primary">
                  <option value={30}>30 seconds</option><option value={60}>60 seconds</option><option value={120}>2 minutes</option>
                </select>
              ) : automation === 'memory-threshold' ? (
                <select value={thresholdMb} onChange={(event) => setThresholdMb(Number(event.target.value))} className="mt-1.5 w-full px-3 py-2 text-sm bg-background rounded-md border border-border-muted text-text-primary">
                  <option value={10}>10 MB</option><option value={20}>20 MB</option><option value={50}>50 MB</option>
                </select>
              ) : (
                <select value={maxSnapshots} onChange={(event) => setMaxSnapshots(Number(event.target.value))} className="mt-1.5 w-full px-3 py-2 text-sm bg-background rounded-md border border-border-muted text-text-primary">
                  <option value={3}>3 snapshots</option><option value={5}>5 snapshots</option><option value={8}>8 snapshots</option>
                </select>
              )}
            </label>
          </div>
          {automation !== 'manual' && (
            <label className="inline-flex items-center gap-2 mt-3 text-xs text-text-secondary">
              Maximum snapshots
              <select value={maxSnapshots} onChange={(event) => setMaxSnapshots(Number(event.target.value))} className="px-2 py-1 bg-background rounded border border-border-muted text-text-primary">
                <option value={3}>3</option><option value={5}>5</option><option value={8}>8</option>
              </select>
            </label>
          )}
          <div className="flex justify-end gap-2 mt-5">
            {dumps.length > 0 && <button type="button" onClick={() => setShowSetup(false)} className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary">Cancel</button>}
            <button type="button" onClick={handleStart} disabled={busy || !scenarioName.trim()} className="px-4 py-2 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50">
              Start and Capture Baseline
            </button>
          </div>
        </section>
      )}

      {sessionActive && session && (
        <section aria-live="polite" className="rounded-xl border border-accent/25 bg-accent/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">
                {session.phase === 'capturing-baseline' && 'Capturing the baseline…'}
                {session.phase === 'running' && 'Reproduce the suspected workflow now'}
                {session.phase === 'capturing-checkpoint' && 'Capturing a checkpoint…'}
                {session.phase === 'capturing-final' && 'Capturing the final snapshot and comparing…'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Return to the same starting screen after each repetition, then mark the iteration.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-right">
              <div><p className="text-[10px] uppercase text-text-muted">Elapsed</p><p className="text-sm font-mono">{formatDuration(now - session.startedAt)}</p></div>
              <div><p className="text-[10px] uppercase text-text-muted">Iterations</p><p className="text-sm font-mono">{session.iterations}</p></div>
              <div><p className="text-[10px] uppercase text-text-muted">Snapshots</p><p className="text-sm font-mono">{session.snapshots.length}/{session.maxSnapshots}</p></div>
              <div><p className="text-[10px] uppercase text-text-muted">Live PSS</p><p className="text-sm font-mono">{liveMemoryPssKb === null ? '—' : formatBytes(liveMemoryPssKb * 1024)}</p></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-accent/15">
            <p className="text-xs text-text-muted">
              {session.automation === 'manual' && 'Baseline and final captures are automatic; checkpoints are optional.'}
              {session.automation === 'interval' && `An automatic checkpoint runs every ${session.intervalSeconds} seconds.`}
              {session.automation === 'memory-threshold' && `A checkpoint runs after PSS grows by ${session.thresholdMb} MB.`}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              <button type="button" onClick={cancelSession} disabled={busy} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-50">Cancel session</button>
              <button type="button" onClick={markIteration} disabled={busy || session.phase !== 'running'} className="px-3 py-1.5 text-xs font-medium bg-surface border border-border-muted rounded-md hover:bg-surface-hover disabled:opacity-50">Mark iteration</button>
              <button type="button" onClick={() => void captureCheckpoint(false)} disabled={busy || session.phase !== 'running' || session.snapshots.length >= session.maxSnapshots - 1} className="px-3 py-1.5 text-xs font-medium bg-surface border border-border-muted rounded-md hover:bg-surface-hover disabled:opacity-50">Checkpoint now</button>
              <button type="button" onClick={() => void finishSession()} disabled={busy || session.phase !== 'running'} className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50">Finish and Analyze</button>
            </div>
          </div>
        </section>
      )}

      {session?.phase === 'error' && (
        <section className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 flex items-center justify-between">
          <div><p className="text-sm font-medium text-red-400">Leak check stopped</p><p className="text-xs text-text-muted mt-1">{session.error || 'A heap capture failed.'}</p></div>
          <button type="button" onClick={cancelSession} className="px-3 py-1.5 text-xs bg-surface border border-border-muted rounded-md">Close session</button>
        </section>
      )}

      {session?.phase === 'complete' && session.comparison && !showSetup && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between">
            <div className="inline-flex p-1 rounded-md bg-surface border border-border-muted">
              <button type="button" aria-pressed={viewMode === 'leak-check'} onClick={() => setViewMode('leak-check')} className={`px-3 py-1 text-xs rounded ${viewMode === 'leak-check' ? 'bg-surface-hover text-text-primary' : 'text-text-muted'}`}>Leak comparison</button>
              <button type="button" aria-pressed={viewMode === 'snapshot'} onClick={() => setViewMode('snapshot')} className={`px-3 py-1 text-xs rounded ${viewMode === 'snapshot' ? 'bg-surface-hover text-text-primary' : 'text-text-muted'}`}>Raw snapshots</button>
            </div>
            <button type="button" onClick={() => void handleExport()} className="px-3 py-1.5 text-xs font-medium bg-surface border border-border-muted rounded-md hover:bg-surface-hover">Export report</button>
          </div>

          {viewMode === 'leak-check' ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Parsed heap change" value={signedBytes(session.comparison.sizeDelta)} tone={session.comparison.sizeDelta > 0 ? 'amber' : 'emerald'} />
                <MetricCard label="Object change" value={signedNumber(session.comparison.objectDelta)} tone={session.comparison.objectDelta > 0 ? 'amber' : 'emerald'} />
                <MetricCard label="Growing classes" value={session.comparison.growingClasses.toLocaleString()} tone="blue" />
                <MetricCard label="Ranked candidates" value={session.comparison.suspects.length.toLocaleString()} tone={session.comparison.suspects.length > 0 ? 'violet' : 'emerald'} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(['suspects', 'growing', 'app', 'all'] as ResultFilter[]).map((filter) => (
                  <button key={filter} type="button" aria-pressed={resultFilter === filter} onClick={() => setResultFilter(filter)} className={`px-3 py-1.5 text-xs rounded-md border capitalize ${resultFilter === filter ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border-muted bg-surface text-text-muted hover:text-text-primary'}`}>{filter === 'app' ? 'My app' : filter}</button>
                ))}
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search compared classes…" className="ml-auto w-72 max-w-full px-3 py-1.5 text-xs bg-surface border border-border-muted rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              </div>

              <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border-muted bg-surface">
                {resultClasses.length === 0 ? (
                  <div className="h-full min-h-48 flex items-center justify-center text-center text-text-muted">
                    <div><p className="text-sm">No classes match this view</p><p className="text-xs mt-1">Try Growing or All classes. A quiet result is not proof that no leak exists.</p></div>
                  </div>
                ) : (
                  <table className="w-full table-fixed">
                    <thead className="sticky top-0 bg-surface border-b border-border-muted">
                      <tr>
                        <SortableHeader label="Candidate class" active={resultSort === 'name'} onClick={() => setResultSort('name')} align="left" widthClass="w-[40%]" />
                        <th className="w-[16%] px-3 py-3 text-right text-xs font-medium uppercase text-text-muted">Before → after</th>
                        <SortableHeader label="Instance delta" active={resultSort === 'instanceDelta'} onClick={() => setResultSort('instanceDelta')} widthClass="w-[14%]" />
                        <SortableHeader label="Shallow delta" active={resultSort === 'shallowSizeDelta'} onClick={() => setResultSort('shallowSizeDelta')} widthClass="w-[15%]" />
                        <SortableHeader label="Confidence" active={resultSort === 'score'} onClick={() => setResultSort('score')} widthClass="w-[15%]" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-muted">
                      {resultClasses.slice(0, 1_000).map((item) => (
                        <tr key={item.name} className="hover:bg-surface-hover/60">
                          <td className="px-4 py-3 overflow-hidden">
                            <p className="font-mono text-sm text-text-primary truncate" title={item.name}>{item.name}</p>
                            <p className="text-[11px] text-text-muted mt-1 truncate" title={item.reasons.join(' · ')}>{item.reasons.join(' · ') || 'Changed between snapshots'}</p>
                          </td>
                          <td className="px-3 py-3 text-right text-xs font-mono text-text-secondary whitespace-nowrap">{item.baselineInstances.toLocaleString()} → {item.finalInstances.toLocaleString()}</td>
                          <td className={`px-3 py-3 text-right text-sm font-mono whitespace-nowrap ${item.instanceDelta > 0 ? 'text-amber-400' : item.instanceDelta < 0 ? 'text-emerald-400' : 'text-text-muted'}`}>{signedNumber(item.instanceDelta)}</td>
                          <td className={`px-3 py-3 text-right text-sm font-mono whitespace-nowrap ${item.shallowSizeDelta > 0 ? 'text-amber-400' : item.shallowSizeDelta < 0 ? 'text-emerald-400' : 'text-text-muted'}`}>{signedBytes(item.shallowSizeDelta)}</td>
                          <td className="px-3 py-3 text-right"><span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-medium uppercase ${confidenceClass(item.confidence)}`}>{item.confidence}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <p className="text-[11px] text-text-muted">Confidence is a heuristic based on repeated growth, application ownership, workflow iterations, and shallow-size change. Reference paths and retained size are not yet part of this score.</p>
            </>
          ) : (
            <SnapshotView
              dumps={dumps}
              selectedDumpId={selectedDump?.id}
              onSelectDump={selectDump}
              analysis={analysis}
              selectedClass={selectedClass}
              onSelectClass={selectClass}
              classes={rawClasses}
              searchTerm={searchTerm}
              onSearch={setSearchTerm}
              rawSort={rawSort}
              onSort={handleRawSort}
            />
          )}
        </div>
      )}

      {!sessionActive && (!session || session.phase !== 'complete') && !showSetup && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">Manual snapshots</p>
            <button type="button" onClick={() => void captureDump()} disabled={busy} className="px-3 py-1.5 text-xs font-medium bg-surface border border-border-muted rounded-md hover:bg-surface-hover disabled:opacity-50">{isCapturing ? 'Capturing…' : isAnalyzing ? 'Analyzing…' : 'Capture snapshot'}</button>
          </div>
          {analysis ? (
            <SnapshotView dumps={dumps} selectedDumpId={selectedDump?.id} onSelectDump={selectDump} analysis={analysis} selectedClass={selectedClass} onSelectClass={selectClass} classes={rawClasses} searchTerm={searchTerm} onSearch={setSearchTerm} rawSort={rawSort} onSort={handleRawSort} />
          ) : (
            <EmptyState busy={busy} onCapture={() => void captureDump()} />
          )}
        </div>
      )}

      {!session && showSetup && busy && <EmptyState busy onCapture={() => undefined} />}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'amber' | 'blue' | 'violet' }) {
  const colors = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    violet: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
  };
  return <div className={`rounded-lg p-3 border ${colors[tone]}`}><p className="text-xs text-text-muted">{label}</p><p className="text-xl font-semibold font-mono mt-1">{value}</p></div>;
}

function SortableHeader({ label, active, onClick, align = 'right', widthClass = '' }: { label: string; active: boolean; onClick: () => void; align?: 'left' | 'right'; widthClass?: string }) {
  return (
    <th className={`${widthClass} px-3 py-3 ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <button type="button" onClick={onClick} className={`text-xs font-medium uppercase tracking-wider hover:text-text-primary ${active ? 'text-text-primary' : 'text-text-muted'}`}>{label}</button>
    </th>
  );
}

function SnapshotView({ dumps, selectedDumpId, onSelectDump, analysis, selectedClass, onSelectClass, classes, searchTerm, onSearch, rawSort, onSort }: {
  dumps: HeapDumpInfo[];
  selectedDumpId?: string;
  onSelectDump: (dump: HeapDumpInfo) => void;
  analysis: HeapAnalysis | null;
  selectedClass: HeapClass | null;
  onSelectClass: (heapClass: HeapClass) => void;
  classes: HeapClass[];
  searchTerm: string;
  onSearch: (value: string) => void;
  rawSort: 'name' | 'instanceCount' | 'shallowSize';
  onSort: (column: 'name' | 'instanceCount' | 'shallowSize') => void;
}) {
  if (!analysis) return <EmptyState busy={false} onCapture={() => undefined} />;
  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className="flex gap-2 overflow-x-auto py-1">
        {dumps.map((dump) => (
          <button key={dump.id} type="button" onClick={() => onSelectDump(dump)} className={`px-3 py-2 rounded-lg text-xs font-mono whitespace-nowrap border ${selectedDumpId === dump.id ? 'bg-accent/20 text-accent border-accent/30' : 'bg-surface border-border-muted hover:bg-surface-hover'}`}>
            <span className="block text-text-primary">{new Date(dump.timestamp).toLocaleTimeString()}</span><span className="block text-text-muted">{formatBytes(dump.fileSize)}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Parsed objects" value={analysis.totalObjects.toLocaleString()} tone="emerald" />
        <MetricCard label="Parsed shallow size" value={formatBytes(analysis.totalSize)} tone="blue" />
        <MetricCard label="Classes indexed" value={analysis.classes.length.toLocaleString()} tone="violet" />
      </div>
      {selectedClass && (
        <div className="rounded-lg border border-border-muted bg-surface px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0"><p className="font-mono text-sm truncate">{selectedClass.name}</p><p className="text-xs text-text-muted mt-1">Average shallow size {formatBytes(selectedClass.shallowSize / Math.max(1, selectedClass.instanceCount))} per instance</p></div>
          <p className="text-xs text-text-muted text-right">Retained ownership is unavailable until reference-graph analysis is enabled.</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <input value={searchTerm} onChange={(event) => onSearch(event.target.value)} placeholder="Search all indexed classes…" className="flex-1 px-3 py-2 text-sm bg-surface rounded-md border border-border-muted text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
        <span className="text-xs text-text-muted">Showing {classes.length.toLocaleString()} of {analysis.classes.length.toLocaleString()}</span>
      </div>
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-auto min-h-0">
        <table className="w-full table-fixed">
          <thead className="sticky top-0 bg-surface border-b border-border-muted">
            <tr>
              <SortableHeader label="Class name" active={rawSort === 'name'} onClick={() => onSort('name')} align="left" widthClass="w-[52%]" />
              <SortableHeader label="Instances" active={rawSort === 'instanceCount'} onClick={() => onSort('instanceCount')} widthClass="w-[16%]" />
              <SortableHeader label="Shallow size" active={rawSort === 'shallowSize'} onClick={() => onSort('shallowSize')} widthClass="w-[16%]" />
              <th className="w-[16%] px-3 py-3 text-right text-xs font-medium uppercase text-text-muted">Retained size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {classes.map((heapClass) => (
              <tr key={heapClass.id} className={selectedClass?.id === heapClass.id ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'}>
                <td className="px-3 py-3 overflow-hidden"><button type="button" onClick={() => onSelectClass(heapClass)} className="block w-full text-left text-sm font-mono text-text-primary truncate hover:text-accent" title={heapClass.name}>{heapClass.name}</button></td>
                <td className="px-3 py-3 text-right text-sm font-mono text-blue-400 whitespace-nowrap">{heapClass.instanceCount.toLocaleString()}</td>
                <td className="px-3 py-3 text-right text-sm font-mono text-emerald-400 whitespace-nowrap">{formatBytes(heapClass.shallowSize)}</td>
                <td className="px-3 py-3 text-right text-sm font-mono text-violet-400 whitespace-nowrap">{heapClass.retainedSize === undefined ? '—' : formatBytes(heapClass.retainedSize)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState({ busy, onCapture }: { busy: boolean; onCapture: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center text-text-muted">
      <div className="text-center max-w-sm">
        <div className={`w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center ${busy ? 'bg-accent/20 animate-pulse' : 'bg-surface-hover'}`}><HeapIcon /></div>
        <p className="text-sm">{busy ? 'Capturing and analyzing the heap…' : 'No heap snapshot selected'}</p>
        <p className="text-xs mt-1">{busy ? 'The target app may pause briefly.' : 'Start a guided leak check or capture a manual snapshot.'}</p>
        {!busy && <button type="button" onClick={onCapture} className="mt-3 px-3 py-1.5 text-xs bg-surface border border-border-muted rounded-md hover:bg-surface-hover">Capture snapshot</button>}
      </div>
    </div>
  );
}
