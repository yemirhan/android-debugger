import React, { useEffect, useMemo, useRef, useState } from 'react';
import { topTags, type LogRow } from '../../lib/log-filter';

interface TagFilterPopoverProps {
  rows: readonly LogRow[];
  includeTags: string[];
  excludeTags: string[];
  onChange: (patch: { includeTags?: string[]; excludeTags?: string[] }) => void;
}

export function TagFilterPopover({ rows, includeTags, excludeTags, onChange }: TagFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCount = includeTags.length + excludeTags.length;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Only computed while open; scanning is bounded to the newest lines.
  const frequent = useMemo(() => (open ? topTags(rows, 10) : []), [open, rows]);

  const only = (tag: string) => {
    const value = tag.trim();
    if (!value) return;
    onChange({
      includeTags: includeTags.includes(value) ? includeTags : [...includeTags, value],
      excludeTags: excludeTags.filter((t) => t !== value),
    });
  };
  const hide = (tag: string) => {
    const value = tag.trim();
    if (!value) return;
    onChange({
      excludeTags: excludeTags.includes(value) ? excludeTags : [...excludeTags, value],
      includeTags: includeTags.filter((t) => t !== value),
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-sm transition-colors ${
          activeCount > 0
            ? 'border-accent/50 bg-accent-muted text-text-primary'
            : 'border-border-muted bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        Tags
        {activeCount > 0 && <span className="font-mono text-xs text-accent">{activeCount}</span>}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-80 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 z-50 animate-pop-in overflow-hidden">
          <form
            className="flex items-center gap-1.5 p-2 border-b border-border-muted"
            onSubmit={(event) => {
              event.preventDefault();
              only(draft);
              setDraft('');
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tag name"
              spellCheck={false}
              className="flex-1 min-w-0 h-8 px-2.5 bg-background rounded-md border border-border-muted font-mono text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="h-8 px-2.5 rounded-md text-sm text-text-primary bg-surface-hover hover:bg-border disabled:opacity-40 transition-colors"
            >
              Only
            </button>
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => {
                hide(draft);
                setDraft('');
              }}
              className="h-8 px-2.5 rounded-md text-sm text-text-primary bg-surface-hover hover:bg-border disabled:opacity-40 transition-colors"
            >
              Hide
            </button>
          </form>

          {(includeTags.length > 0 || excludeTags.length > 0) && (
            <div className="px-3 py-2 space-y-2 border-b border-border-muted">
              {includeTags.length > 0 && (
                <ChipRow
                  label="Only showing"
                  tags={includeTags}
                  onRemove={(tag) => onChange({ includeTags: includeTags.filter((t) => t !== tag) })}
                />
              )}
              {excludeTags.length > 0 && (
                <ChipRow
                  label="Hiding"
                  tags={excludeTags}
                  onRemove={(tag) => onChange({ excludeTags: excludeTags.filter((t) => t !== tag) })}
                />
              )}
              <button
                onClick={() => onChange({ includeTags: [], excludeTags: [] })}
                className="text-xs text-accent hover:underline"
              >
                Clear tag filters
              </button>
            </div>
          )}

          <div className="py-1 max-h-64 overflow-y-auto">
            <p className="px-3 pt-1.5 pb-1 text-xs text-text-muted">Most frequent in the buffer</p>
            {frequent.length === 0 ? (
              <p className="px-3 pb-2 text-xs text-text-secondary">Tags show up here once lines arrive.</p>
            ) : (
              frequent.map(({ tag, count }) => (
                <div key={tag} className="group flex items-center gap-2 px-3 h-8 hover:bg-surface-hover">
                  <span className="flex-1 min-w-0 truncate font-mono text-xs text-text-primary" title={tag}>
                    {tag}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted">{count.toLocaleString()}</span>
                  <button
                    onClick={() => only(tag)}
                    className="text-xs px-1.5 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-border transition-colors"
                  >
                    Only
                  </button>
                  <button
                    onClick={() => hide(tag)}
                    className="text-xs px-1.5 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-border transition-colors"
                  >
                    Hide
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChipRow({ label, tags, onRemove }: { label: string; tags: string[]; onRemove: (tag: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-text-muted mr-0.5">{label}</span>
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded bg-background border border-border-muted font-mono text-[11px] text-text-primary">
          <span className="max-w-[160px] truncate">{tag}</span>
          <button
            onClick={() => onRemove(tag)}
            aria-label={`Remove ${tag}`}
            className="w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
