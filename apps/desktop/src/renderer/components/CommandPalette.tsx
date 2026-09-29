import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TabId } from '../App';
import { dashboardItem, navigationGroups, settingsItem } from '../data/navigation';
import type { NavItem } from '../types/navigation';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tab: TabId) => void;
  hasPackage: boolean;
}

interface Entry {
  item: NavItem;
  group: string;
}

const entries: Entry[] = [
  { item: dashboardItem, group: 'General' },
  ...navigationGroups.flatMap((group) => group.items.map((item) => ({ item, group: group.label }))),
  { item: settingsItem, group: 'General' },
];

/** Ranks prefix matches first, then word-start matches, then plain substring matches. */
function score(entry: Entry, query: string): number {
  const label = entry.item.label.toLowerCase();
  if (label.startsWith(query)) return 3;
  if (label.split(/[\s/]+/).some((word) => word.startsWith(query))) return 2;
  if (label.includes(query)) return 1;
  if (entry.group.toLowerCase().includes(query)) return 0.5;
  return 0;
}

export function CommandPalette({ isOpen, onClose, onSelect, hasPackage }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries
      .map((entry) => ({ entry, score: score(entry, q) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((result) => result.entry);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onSelect(entry.item.id);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[selected]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh]" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Jump to a tool"
        className="relative w-full max-w-lg mx-4 bg-surface-elevated border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-pop-in"
      >
        <div className="flex items-center gap-3 px-4 border-b border-border-muted">
          <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a tool…"
            aria-label="Search tools"
            className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none focus-visible:outline-none"
          />
          <span className="kbd">esc</span>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-muted">No tool matches “{query}”</p>
          ) : (
            results.map((entry, index) => (
              <button
                key={entry.item.id}
                data-index={index}
                role="option"
                aria-selected={index === selected}
                onMouseMove={() => setSelected(index)}
                onClick={() => choose(entry)}
                className={`w-full flex items-center gap-3 h-9 px-3 rounded-md text-left transition-colors ${
                  index === selected ? 'bg-accent-muted text-text-primary' : 'text-text-secondary'
                }`}
              >
                <span
                  className={`w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 flex-shrink-0 ${
                    index === selected ? 'text-accent' : 'text-text-muted'
                  }`}
                >
                  {entry.item.icon}
                </span>
                <span className="text-[13px] flex-1 truncate">{entry.item.label}</span>
                {entry.item.needsPackage && !hasPackage && (
                  <span className="text-[11px] text-text-muted">needs an app</span>
                )}
                <span className="text-[11px] text-text-muted w-24 text-right">{entry.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
