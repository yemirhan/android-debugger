import React, { useEffect, useState } from 'react';
import { formatLogLine, type LogRow } from '../../lib/log-filter';

const LEVEL_NAMES: Record<string, string> = {
  V: 'Verbose',
  D: 'Debug',
  I: 'Info',
  W: 'Warning',
  E: 'Error',
  F: 'Fatal',
  S: 'Silent',
};

interface LogDetailsProps {
  row: LogRow;
  onClose: () => void;
  onOnlyTag: (tag: string) => void;
  onHideTag: (tag: string) => void;
}

export function LogDetails({ row, onClose, onOnlyTag, onHideTag }: LogDetailsProps) {
  const [copied, setCopied] = useState<'message' | 'line' | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (what: 'message' | 'line') => {
    try {
      await navigator.clipboard.writeText(what === 'message' ? row.message : formatLogLine(row));
      setCopied(what);
    } catch {
      // Clipboard can be unavailable when the window is not focused.
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-border bg-surface-elevated flex flex-col max-h-[45%] min-h-[128px] animate-fade-in">
      <div className="flex items-center gap-3 px-3 h-10 border-b border-border-muted flex-shrink-0">
        <span className={`text-xs font-semibold log-${row.level}`}>{LEVEL_NAMES[row.level] ?? row.level}</span>
        <span className="font-mono text-xs text-text-primary truncate max-w-[240px]" title={row.tag}>
          {row.tag}
        </span>
        <span className="font-mono text-xs text-text-muted truncate">
          {row.timestamp}
          {row.pid !== undefined && ` · pid ${row.pid}`}
          {row.tid !== undefined && ` · tid ${row.tid}`}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          <DetailButton onClick={() => copy('message')}>{copied === 'message' ? 'Copied' : 'Copy message'}</DetailButton>
          <DetailButton onClick={() => copy('line')}>{copied === 'line' ? 'Copied' : 'Copy line'}</DetailButton>
          <DetailButton onClick={() => onOnlyTag(row.tag)} title={`Show only lines tagged ${row.tag}`}>
            Only this tag
          </DetailButton>
          <DetailButton onClick={() => onHideTag(row.tag)} title={`Hide lines tagged ${row.tag}`}>
            Hide tag
          </DetailButton>
          <button
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close details"
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <pre className="flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-5 text-text-primary whitespace-pre-wrap break-words select-text">
        {row.message || <span className="text-text-muted">(empty message)</span>}
      </pre>
    </div>
  );
}

function DetailButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-7 px-2 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      {children}
    </button>
  );
}
