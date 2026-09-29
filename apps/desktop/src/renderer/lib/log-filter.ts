/**
 * Pure log filtering for the Logs view. Kept free of React and runtime
 * imports so it can be unit-tested from src/main/log-filter.test.ts.
 */
import type { LogLevel } from '@android-debugger/shared';
import type { LogLine } from '../../main/logcat-format';

/** A log line as held by the renderer store; `seq` increases with arrival order. */
export interface LogRow extends LogLine {
  seq: number;
}

export interface LogFilter {
  /** Lowest level shown. */
  minLevel: LogLevel;
  search: string;
  /** Treat `search` as a case-insensitive regular expression. */
  regex: boolean;
  /** When non-empty, only these tags are shown. */
  includeTags: string[];
  excludeTags: string[];
}

export const DEFAULT_LOG_FILTER: LogFilter = {
  minLevel: 'V',
  search: '',
  regex: false,
  includeTags: [],
  excludeTags: [],
};

export const LEVEL_RANK: Record<LogLevel, number> = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5, S: 6 };

export interface CompiledLogFilter {
  key: string;
  /** Set when `search` is an invalid regex; the search is then ignored. */
  error: string | null;
  isActive: boolean;
  test: (row: LogLine) => boolean;
}

export function compileLogFilter(filter: LogFilter): CompiledLogFilter {
  const minRank = LEVEL_RANK[filter.minLevel] ?? 0;
  const include = filter.includeTags.length > 0 ? new Set(filter.includeTags) : null;
  const exclude = filter.excludeTags.length > 0 ? new Set(filter.excludeTags) : null;
  const search = filter.search.trim();

  let error: string | null = null;
  let matchText: ((text: string) => boolean) | null = null;
  if (search) {
    if (filter.regex) {
      try {
        const re = new RegExp(search, 'i');
        matchText = (text) => re.test(text);
      } catch (e) {
        error = e instanceof Error ? e.message.replace(/^Invalid regular expression: /, '') : 'Invalid pattern';
      }
    } else {
      const needle = search.toLowerCase();
      matchText = (text) => text.toLowerCase().includes(needle);
    }
  }

  const test = (row: LogLine) => {
    if ((LEVEL_RANK[row.level] ?? 0) < minRank) return false;
    if (include && !include.has(row.tag)) return false;
    if (exclude && exclude.has(row.tag)) return false;
    if (matchText && !matchText(row.message) && !matchText(row.tag)) return false;
    return true;
  };

  const key = JSON.stringify([
    filter.minLevel,
    error ? '' : search,
    filter.regex,
    [...filter.includeTags].sort(),
    [...filter.excludeTags].sort(),
  ]);
  const isActive = minRank > 0 || !!include || !!exclude || (!!matchText && !error);
  return { key, error, isActive, test };
}

/** Index of the first row with seq > `seq` (rows are sorted by seq). */
export function firstIndexAfter(rows: readonly LogRow[], seq: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid].seq <= seq) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Memoizes the filtered view of an append-mostly row list. When only new rows
 * were appended (and old ones evicted from the front) it filters just the new
 * rows, so a stream of batches costs O(batch) instead of O(buffer).
 */
export class FilteredRowsCache {
  private source: readonly LogRow[] | null = null;
  private generation = -1;
  private key = '';
  private result: LogRow[] = [];

  get(rows: readonly LogRow[], generation: number, filter: CompiledLogFilter): readonly LogRow[] {
    if (rows === this.source && generation === this.generation && filter.key === this.key) return this.result;

    const prev = this.source;
    const canExtend =
      prev !== null && generation === this.generation && filter.key === this.key && prev.length > 0 && rows.length > 0;

    if (!filter.isActive) {
      this.result = rows as LogRow[];
    } else if (canExtend) {
      const lastSeenSeq = prev[prev.length - 1].seq;
      const firstSeq = rows[0].seq;
      let start = 0;
      while (start < this.result.length && this.result[start].seq < firstSeq) start++;
      const added: LogRow[] = [];
      for (let i = firstIndexAfter(rows, lastSeenSeq); i < rows.length; i++) {
        if (filter.test(rows[i])) added.push(rows[i]);
      }
      this.result = start === 0 && added.length === 0 ? this.result : this.result.slice(start).concat(added);
    } else {
      this.result = rows.filter(filter.test);
    }

    this.source = rows;
    this.generation = generation;
    this.key = filter.key;
    return this.result;
  }
}

/** Tags seen in the newest `window` rows, most frequent first. */
export function topTags(rows: readonly LogRow[], limit = 12, window = 5000): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (let i = Math.max(0, rows.length - window); i < rows.length; i++) {
    const tag = rows[i].tag;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/** One line in logcat `threadtime` style, for export and "copy line". */
export function formatLogLine(row: LogLine): string {
  const pid = row.pid !== undefined ? String(row.pid).padStart(5) : '    -';
  const tid = row.tid !== undefined ? String(row.tid).padStart(5) : '    -';
  return `${row.timestamp} ${pid} ${tid} ${row.level} ${row.tag}: ${row.message}`;
}

/** "11:20:17.453" from "2026-09-29 11:20:17.453" or "09-29 11:20:17.453". */
export function shortTime(timestamp: string): string {
  const space = timestamp.lastIndexOf(' ');
  return space >= 0 ? timestamp.slice(space + 1) : timestamp;
}
