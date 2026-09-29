import React, { useEffect, useRef, useState } from 'react';
import { dismissToast, useToasts, type Toast } from '../lib/toast';

const icons: Record<Toast['kind'], React.ReactNode> = {
  success: (
    <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 text-log-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  loading: (
    <svg className="w-4 h-4 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  ),
};

function ToastItem({ toast }: { toast: Toast }) {
  const [hovered, setHovered] = useState(false);
  const [busyAction, setBusyAction] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restart the timer whenever the toast changes (e.g. loading → success);
  // hovering pauses it so there's time to read errors or click an action.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (toast.duration > 0 && !hovered) {
      timerRef.current = setTimeout(() => dismissToast(toast.id), toast.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, hovered]);

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="pointer-events-auto w-80 flex items-start gap-3 px-3.5 py-3 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 animate-pop-in"
    >
      <span className="mt-0.5 flex-shrink-0">{icons[toast.kind]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary break-words">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-text-secondary mt-0.5 break-words select-text">{toast.description}</p>
        )}
        {toast.actions && toast.actions.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {toast.actions.map((action, index) => (
              <button
                key={action.label}
                disabled={busyAction !== null}
                onClick={async () => {
                  setBusyAction(index);
                  try {
                    await action.run();
                  } finally {
                    setBusyAction(null);
                  }
                }}
                className="text-xs font-medium text-accent hover:text-text-primary disabled:opacity-50 transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/** Renders the toast stack; mount once near the app root. */
export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
