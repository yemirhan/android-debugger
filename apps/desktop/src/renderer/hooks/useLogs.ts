import { useDeferredValue, useMemo, useSyncExternalStore } from 'react';
import type { LogStreamMode } from '../../main/logcat-format';
import { getAppSettings } from '../lib/app-settings';
import {
  DEFAULT_LOG_FILTER,
  FilteredRowsCache,
  compileLogFilter,
  firstIndexAfter,
  type LogRow,
} from '../lib/log-filter';
import { createLogStore, type LogStoreState } from '../lib/log-store';

const MODE_KEY = 'android-debugger:log-mode';

function loadMode(): LogStreamMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'rn' || saved === 'app' || saved === 'device') return saved;
  } catch {
    // Storage unavailable; use the default.
  }
  return 'rn';
}

/**
 * The one log buffer for the app. It outlives the Logs panel, so switching
 * tabs never drops, replays or re-processes lines.
 */
export const logStore = createLogStore({
  capacity: getAppSettings().maxLogEntries,
  defaultFilter: DEFAULT_LOG_FILTER,
  mode: loadMode(),
  enabled: getAppSettings().autoStartLogcat,
  onModeChange: (mode) => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Persistence is best-effort.
    }
  },
});

export function useLogStore(): LogStoreState {
  return useSyncExternalStore(logStore.subscribe, logStore.getState);
}

type LogControls = Pick<LogStoreState, 'mode' | 'enabled' | 'restartToken' | 'status'>;
let controlsCache: LogControls | null = null;
function getControls(): LogControls {
  const { mode, enabled, restartToken, status } = logStore.getState();
  const c = controlsCache;
  if (!c || c.mode !== mode || c.enabled !== enabled || c.restartToken !== restartToken || c.status !== status) {
    controlsCache = { mode, enabled, restartToken, status };
  }
  return controlsCache!;
}

/** Stream controls only: does not re-render when lines arrive. */
export function useLogControls(): LogControls {
  return useSyncExternalStore(logStore.subscribe, getControls);
}

// Module-level so a remounted panel reuses the already-filtered rows.
const liveCache = new FilteredRowsCache();
const frozenCache = new FilteredRowsCache();

export interface LogView {
  state: LogStoreState;
  /** Rows to display (filtered; frozen while paused). Oldest first. */
  rows: readonly LogRow[];
  /** Inline error for an invalid regex; the search is ignored meanwhile. */
  filterError: string | null;
  filterActive: boolean;
  /** True while a new filter is still being applied in the background. */
  isFiltering: boolean;
  /** Raw lines that arrived after pausing. */
  newWhilePaused: number;
}

export function useLogView(): LogView {
  const state = useLogStore();
  // Typing in the search box stays responsive: filtering a large buffer
  // happens in a lower-priority render.
  const deferredFilter = useDeferredValue(state.filter);
  const compiled = useMemo(() => compileLogFilter(deferredFilter), [deferredFilter]);
  const current = useMemo(() => compileLogFilter(state.filter), [state.filter]);

  const frozen = state.paused ? state.frozenRows : null;
  const rows = frozen
    ? frozenCache.get(frozen, state.frozenGeneration, compiled)
    : liveCache.get(state.rows, state.generation, compiled);

  let newWhilePaused = 0;
  if (frozen) {
    const lastFrozenSeq = frozen.length > 0 ? frozen[frozen.length - 1].seq : -Infinity;
    newWhilePaused = state.rows.length - firstIndexAfter(state.rows, lastFrozenSeq);
  }

  return {
    state,
    rows,
    filterError: current.error,
    filterActive: current.isActive,
    isFiltering: deferredFilter !== state.filter,
    newWhilePaused,
  };
}
