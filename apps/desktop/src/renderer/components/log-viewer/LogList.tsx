import React, { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { firstIndexAfter, shortTime, type LogRow } from '../../lib/log-filter';

/** Fixed row height keeps windowing trivial; the full text lives in the detail pane. */
export const LOG_ROW_HEIGHT = 22;
const OVERSCAN = 16;
/** Distance from the bottom (px) that still counts as "at the latest line". */
const BOTTOM_SLACK = 4;

/**
 * Scroll state survives unmounting, so coming back to the Logs tab lands where
 * the user left it: still following, or on the same line.
 */
const memory = {
  following: true,
  anchorSeq: -1,
  anchorOffset: 0,
  /** Seq of the newest row when the user stopped following. */
  seenSeq: -1,
};

const MESSAGE_CLASS: Record<string, string> = {
  V: 'text-text-muted',
  D: 'text-text-primary',
  I: 'text-text-primary',
  W: 'text-log-warn',
  E: 'text-log-error',
  F: 'text-log-fatal',
  S: 'text-text-muted',
};

interface LogListProps {
  rows: readonly LogRow[];
  selectedSeq: number | null;
  onSelect: (row: LogRow | null) => void;
  showPid: boolean;
  /** Rendered instead of rows when there are none. */
  empty?: React.ReactNode;
  /** Hide the "jump to latest" pill (e.g. while paused, which has its own). */
  suppressJumpPill?: boolean;
}

/**
 * Terminal-style, windowed log view: newest line at the bottom, follows new
 * lines until the user scrolls up, and only renders the rows in view.
 */
export function LogList({ rows, selectedSeq, onSelect, showPid, empty, suppressJumpPill }: LogListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [following, setFollowingState] = useState(memory.following);
  const followingRef = useRef(memory.following);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const setFollowing = useCallback((next: boolean) => {
    if (followingRef.current === next) return;
    followingRef.current = next;
    memory.following = next;
    if (!next) {
      const current = rowsRef.current;
      memory.seenSeq = current.length > 0 ? current[current.length - 1].seq : -1;
    }
    setFollowingState(next);
  }, []);

  const rememberAnchor = (el: HTMLDivElement) => {
    const current = rowsRef.current;
    const top = Math.min(current.length - 1, Math.floor(el.scrollTop / LOG_ROW_HEIGHT));
    if (top >= 0) {
      memory.anchorSeq = current[top].seq;
      memory.anchorOffset = el.scrollTop - top * LOG_ROW_HEIGHT;
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
    setFollowing(atBottom);
    if (!atBottom) rememberAnchor(el);
  };

  // Scrolling up stops following at once, even if a batch lands before the
  // scroll event does.
  const handleWheel = (event: React.WheelEvent) => {
    if (event.deltaY < 0 && followingRef.current) setFollowing(false);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    setViewport(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Keep the view pinned: to the bottom while following, otherwise to the
  // line being read, so lines evicted above never shift it.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (followingRef.current) {
      const bottom = Math.max(0, rows.length * LOG_ROW_HEIGHT - el.clientHeight);
      if (Math.abs(el.scrollTop - bottom) > 1) el.scrollTop = bottom;
    } else if (memory.anchorSeq >= 0) {
      const index = firstIndexAfter(rows, memory.anchorSeq - 1);
      const target = index * LOG_ROW_HEIGHT + memory.anchorOffset;
      if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
    }
    setScrollTop(el.scrollTop);
  }, [rows, viewport]);

  const jumpToLatest = useCallback(() => {
    setFollowing(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [setFollowing]);

  const selectedIndex = selectedSeq === null ? -1 : indexOfSeq(rows, selectedSeq);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const el = scrollRef.current;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const base = selectedIndex >= 0 ? selectedIndex : delta > 0 ? -1 : rows.length;
      const next = Math.min(rows.length - 1, Math.max(0, base + delta));
      onSelect(rows[next]);
      if (el) {
        const top = next * LOG_ROW_HEIGHT;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + LOG_ROW_HEIGHT > el.scrollTop + el.clientHeight) {
          el.scrollTop = top + LOG_ROW_HEIGHT - el.clientHeight;
        }
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      jumpToLatest();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFollowing(false);
      if (el) el.scrollTop = 0;
    } else if (event.key === 'Escape' && selectedSeq !== null) {
      onSelect(null);
    }
  };

  const total = rows.length;
  const start = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / LOG_ROW_HEIGHT) + OVERSCAN);
  const visible = rows.slice(start, end);
  const newCount = following ? 0 : total - firstIndexAfter(rows, memory.seenSeq);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="log"
        aria-label="Log lines"
        data-following={following}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden outline-none"
      >
        {total === 0 ? (
          empty
        ) : (
          <div style={{ height: total * LOG_ROW_HEIGHT, position: 'relative' }}>
            <div style={{ transform: `translateY(${start * LOG_ROW_HEIGHT}px)` }}>
              {visible.map((row) => (
                <LogRowView
                  key={row.seq}
                  row={row}
                  selected={row.seq === selectedSeq}
                  showPid={showPid}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {!following && !suppressJumpPill && total > 0 && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent text-white text-sm font-medium shadow-lg shadow-black/40 hover:bg-accent-hover transition-colors animate-pop-in"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          {newCount > 0 ? `Jump to latest (${newCount.toLocaleString()} new)` : 'Jump to latest'}
        </button>
      )}
    </div>
  );
}

function indexOfSeq(rows: readonly LogRow[], seq: number): number {
  const index = firstIndexAfter(rows, seq - 1);
  return index < rows.length && rows[index].seq === seq ? index : -1;
}

interface LogRowViewProps {
  row: LogRow;
  selected: boolean;
  showPid: boolean;
  onSelect: (row: LogRow | null) => void;
}

const LogRowView = memo(function LogRowView({ row, selected, showPid, onSelect }: LogRowViewProps) {
  return (
    <div
      onClick={() => onSelect(selected ? null : row)}
      data-log-row
      className={`flex items-center gap-3 px-3 font-mono text-xs cursor-default whitespace-nowrap ${
        selected ? 'bg-accent-muted' : 'hover:bg-surface-hover'
      }`}
      style={{ height: LOG_ROW_HEIGHT }}
    >
      <span className="w-[86px] flex-shrink-0 text-text-muted">{shortTime(row.timestamp)}</span>
      {showPid && <span className="w-[44px] flex-shrink-0 text-right text-text-muted">{row.pid ?? ''}</span>}
      <span className={`w-3 flex-shrink-0 text-center font-semibold log-${row.level}`}>{row.level}</span>
      <span className="w-[160px] flex-shrink-0 truncate text-text-secondary" title={row.tag}>
        {row.tag}
      </span>
      <span className={`flex-1 min-w-0 truncate ${MESSAGE_CLASS[row.level] ?? 'text-text-primary'}`}>
        {row.message}
      </span>
    </div>
  );
});
