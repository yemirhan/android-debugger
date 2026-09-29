import React, { useEffect, useId, useRef, useState } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width class. */
  width?: string;
  /** While busy, Escape and the backdrop don't close it. */
  busy?: boolean;
}

/** Modal dialog in the app's elevated-surface style. Escape and the backdrop close it. */
export function Dialog({ open, onClose, title, description, children, footer, width = 'max-w-md', busy = false }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, busy, onClose]);

  // Move focus into the dialog so keyboard users land in it.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target = panel.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button:not([data-dialog-close])');
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full ${width} max-h-full flex flex-col bg-surface-elevated border border-border rounded-xl shadow-2xl shadow-black/50 animate-pop-in`}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-text-primary">
              {title}
            </h2>
            {description && <div className="text-sm text-text-secondary mt-1">{description}</div>}
          </div>
          <button
            type="button"
            data-dialog-close
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="w-7 h-7 -mr-1.5 -mt-0.5 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover disabled:opacity-40 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children && <div className="px-5 pb-4 overflow-y-auto min-h-0">{children}</div>}
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border-muted">{footer}</div>}
      </div>
    </div>
  );
}

export const buttonStyles = {
  primary:
    'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent transition-colors btn-press',
  secondary:
    'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-sm rounded-md border border-border-muted bg-surface-elevated text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 disabled:hover:bg-surface-elevated disabled:hover:text-text-secondary transition-colors btn-press',
  danger:
    'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 text-sm font-medium rounded-md bg-log-fatal text-white hover:bg-red-600 disabled:opacity-50 transition-colors btn-press',
  ghost:
    'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 text-sm rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 transition-colors',
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** Asks before a destructive action. The confirm button shows progress while `onConfirm` runs. */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'danger', onConfirm, onCancel }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      busy={busy}
      footer={
        <>
          <button type="button" className={buttonStyles.secondary} onClick={onCancel} disabled={busy} data-autofocus>
            Cancel
          </button>
          <button type="button" className={tone === 'danger' ? buttonStyles.danger : buttonStyles.primary} onClick={confirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-text-secondary space-y-2">{body}</div>
    </Dialog>
  );
}

interface MenuItem {
  id: string;
  label: string;
  description?: string;
  onSelect?: () => void;
  disabled?: boolean | string;
  tone?: 'danger';
  /** Renders a checkbox; `onSelect` toggles it and the menu stays open. */
  checked?: boolean;
}

export type MenuEntry = MenuItem | 'separator';

interface MenuProps {
  items: MenuEntry[];
  /** Renders the trigger; call `toggle` from its onClick. */
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  align?: 'left' | 'right';
  label: string;
}

/** Small dropdown menu (Start options, row overflow). Closes on outside click and Escape. */
export function Menu({ items, trigger, align = 'right', label }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute top-full mt-1.5 ${align === 'right' ? 'right-0' : 'left-0'} min-w-[220px] max-w-[300px] bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 z-40 animate-pop-in p-1`}
        >
          {items.map((item, index) =>
            item === 'separator' ? (
              <div key={`sep-${index}`} className="my-1 h-px bg-border-muted" />
            ) : (
              <button
                key={item.id}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={item.checked}
                disabled={!!item.disabled}
                title={typeof item.disabled === 'string' ? item.disabled : undefined}
                onClick={() => {
                  if (item.checked === undefined) setOpen(false);
                  item.onSelect?.();
                }}
                className={`w-full flex items-start gap-2 px-2.5 py-1.5 rounded-md text-left text-sm transition-colors disabled:opacity-45 disabled:cursor-default ${
                  item.tone === 'danger' ? 'text-log-error hover:bg-red-500/10 disabled:hover:bg-transparent' : 'text-text-primary hover:bg-surface-hover disabled:hover:bg-transparent'
                }`}
              >
                {item.checked !== undefined && (
                  <span
                    className={`mt-0.5 w-3.5 h-3.5 flex-shrink-0 rounded-[4px] border flex items-center justify-center ${
                      item.checked ? 'bg-accent border-accent text-white' : 'border-border bg-background'
                    }`}
                  >
                    {item.checked && (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  {(item.description || typeof item.disabled === 'string') && (
                    <span className="block text-xs text-text-muted">{typeof item.disabled === 'string' ? item.disabled : item.description}</span>
                  )}
                </span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
