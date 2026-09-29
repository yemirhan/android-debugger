import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { scoreItem } from '../commands/fuzzy';
import { getRecentCommandIds, recordRecentCommand, useCommands } from '../commands/registry';
import {
  COMMAND_GROUPS,
  type ChoicesCommand,
  type Command,
  type CommandChoice,
  type CommandContext,
  type ConfirmCommand,
  type InputCommand,
} from '../commands/types';
import { describeError, toast } from '../lib/toast';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  /** Live app state; read again at execution time. */
  context: CommandContext;
}

type Page =
  | { kind: 'root' }
  | { kind: 'choices'; command: ChoicesCommand; choices: CommandChoice[] | null; error: string | null }
  | { kind: 'input'; command: InputCommand }
  | { kind: 'confirm'; command: ConfirmCommand; details: { title: string; body: string; confirmLabel: string } };

interface StackEntry {
  page: Page;
  /** Query and selection to restore when coming back to this page. */
  query: string;
  selected: number;
}

interface Row {
  key: string;
  section?: string;
  title: string;
  indices?: number[];
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: string;
  shortcut?: string[];
  opensPage?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

const groupLabel = new Map(COMMAND_GROUPS.map((group) => [group.id, group.label]));
const groupOrder = new Map(COMMAND_GROUPS.map((group, index) => [group.id, index]));

function pageTitle(page: Page): string | null {
  return page.kind === 'root' ? null : page.command.title.replace(/…$/, '');
}

function Highlighted({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices || indices.length === 0) return <>{text}</>;
  const set = new Set(indices);
  const parts: React.ReactNode[] = [];
  let buffer = '';
  let matched = false;
  const flush = (key: number) => {
    if (!buffer) return;
    parts.push(matched ? <mark key={key} className="bg-transparent text-text-primary font-semibold">{buffer}</mark> : buffer);
    buffer = '';
  };
  for (let index = 0; index < text.length; index += 1) {
    const isMatch = set.has(index);
    if (isMatch !== matched) {
      flush(index);
      matched = isMatch;
    }
    buffer += text[index];
  }
  flush(text.length);
  return <>{parts}</>;
}

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
  </svg>
);

const BackIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

export function CommandPalette({ isOpen, onClose, context }: CommandPaletteProps) {
  const commands = useCommands();
  const [stack, setStack] = useState<StackEntry[]>([{ page: { kind: 'root' }, query: '', selected: 0 }]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const loadTokenRef = useRef(0);

  const page = stack[stack.length - 1].page;

  useEffect(() => {
    if (!isOpen) return;
    setStack([{ page: { kind: 'root' }, query: '', selected: 0 }]);
    setQuery('');
    setSelected(0);
    setInputError(null);
  }, [isOpen]);

  // Focus synchronously after mount: requestAnimationFrame is throttled while
  // the window is in the background, which could leave keys going nowhere.
  useLayoutEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen, stack.length]);

  const close = useCallback(() => {
    loadTokenRef.current += 1;
    onClose();
  }, [onClose]);

  /** Closes the panel, then runs the action; unexpected throws become an error toast. */
  const execute = useCallback(
    (title: string, action: (ctx: CommandContext) => void | Promise<void>) => {
      close();
      Promise.resolve()
        .then(() => action(contextRef.current))
        .catch((error) => toast.error(`${title} failed`, { description: describeError(error) }));
    },
    [close]
  );

  const push = useCallback(
    (next: Page) => {
      setStack((current) => {
        const copy = [...current];
        copy[copy.length - 1] = { ...copy[copy.length - 1], query, selected };
        return [...copy, { page: next, query: '', selected: 0 }];
      });
      setQuery('');
      setSelected(0);
      setInputError(null);
    },
    [query, selected]
  );

  const pop = useCallback(() => {
    if (stack.length <= 1) return;
    loadTokenRef.current += 1;
    const next = stack.slice(0, -1);
    const top = next[next.length - 1];
    setStack(next);
    setQuery(top.query);
    setSelected(top.selected);
    setInputError(null);
  }, [stack]);

  const openCommand = useCallback(
    (command: Command) => {
      recordRecentCommand(command.id);
      const ctx = contextRef.current;
      switch (command.kind) {
        case 'action':
          execute(command.title, command.run);
          return;
        case 'confirm':
          push({ kind: 'confirm', command, details: command.confirm(ctx) });
          return;
        case 'input':
          push({ kind: 'input', command });
          return;
        case 'choices': {
          const token = ++loadTokenRef.current;
          push({ kind: 'choices', command, choices: null, error: null });
          Promise.resolve()
            .then(() => command.load(ctx))
            .then(
              (choices) => ({ choices, error: null }),
              (error) => ({ choices: [] as CommandChoice[], error: describeError(error) })
            )
            .then((result) => {
              if (token !== loadTokenRef.current) return;
              setStack((current) => {
                const top = current[current.length - 1];
                if (top.page.kind !== 'choices' || top.page.command !== command) return current;
                return [...current.slice(0, -1), { ...top, page: { ...top.page, ...result } }];
              });
            });
        }
      }
    },
    [execute, push]
  );

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();

    if (page.kind === 'root') {
      const visible = commands.filter((command) => !command.hidden?.(context));
      const toRow = (command: Command, indices?: number[], section?: string): Row => {
        const availability = command.when?.(context) ?? true;
        return {
          key: command.id,
          section: section ?? groupLabel.get(command.group),
          title: command.title,
          indices,
          subtitle: command.subtitle?.(context),
          icon: command.icon,
          disabled: availability === true ? undefined : availability,
          shortcut: command.shortcut,
          opensPage: command.kind === 'choices' || command.kind === 'input',
          onSelect: () => openCommand(command),
        };
      };

      if (!q) {
        const recentIds = getRecentCommandIds();
        const recent = recentIds
          .map((id) => visible.find((command) => command.id === id))
          .filter((command): command is Command => !!command && (command.when?.(context) ?? true) === true);
        const recentSet = new Set(recent);
        const rest = visible
          .filter((command) => !recentSet.has(command))
          .sort((a, b) => (groupOrder.get(a.group) ?? 99) - (groupOrder.get(b.group) ?? 99));
        return [...recent.map((command) => toRow(command, undefined, 'Recent')), ...rest.map((command) => toRow(command))];
      }

      const scored = visible
        .map((command) => ({
          command,
          match: scoreItem(q, { title: command.title, keywords: command.keywords, group: groupLabel.get(command.group) }),
        }))
        .filter((entry): entry is { command: Command; match: NonNullable<typeof entry.match> } => entry.match !== null)
        // Runnable commands first, then by score.
        .map((entry) => ({ ...entry, rank: entry.match.score - ((entry.command.when?.(context) ?? true) === true ? 0 : 1000) }))
        .sort((a, b) => b.rank - a.rank);
      // Keep results grouped: sections ordered by their best match.
      const sectionOrder: string[] = [];
      for (const entry of scored) {
        if (!sectionOrder.includes(entry.command.group)) sectionOrder.push(entry.command.group);
      }
      return sectionOrder.flatMap((group) =>
        scored.filter((entry) => entry.command.group === group).map((entry) => toRow(entry.command, entry.match.indices))
      );
    }

    if (page.kind === 'choices') {
      const choices = page.choices ?? [];
      return choices
        .map((choice) => ({
          choice,
          match: scoreItem(q, { title: choice.title, keywords: [...(choice.keywords ?? []), choice.subtitle ?? ''] }),
        }))
        .filter((entry) => entry.match !== null)
        .sort((a, b) => (q ? b.match!.score - a.match!.score : 0))
        .map(({ choice, match }) => ({
          key: choice.id,
          title: choice.title,
          indices: match!.indices,
          subtitle: choice.subtitle,
          icon: choice.icon,
          badge: choice.badge,
          disabled: choice.disabled,
          onSelect: () => execute(choice.title, choice.run),
        }));
    }

    if (page.kind === 'input') {
      const { command } = page;
      const submit = (value: string) => {
        const error = command.validate?.(value) ?? null;
        if (error) {
          setInputError(error);
          return;
        }
        execute(command.title, (ctx) => command.run(ctx, value));
      };
      const result: Row[] = [];
      if (q) {
        result.push({ key: '__submit', title: q, subtitle: 'Press Enter to run', icon: command.icon, onSelect: () => submit(q) });
      }
      const suggestions = (command.suggestions?.(context) ?? []).filter((value) => value !== q && (!q || value.toLowerCase().includes(q.toLowerCase())));
      for (const value of suggestions) {
        result.push({ key: `s:${value}`, section: 'Recent', title: value, icon: command.icon, onSelect: () => submit(value) });
      }
      return result;
    }

    // confirm
    const { command, details } = page;
    return [
      { key: '__confirm', title: details.confirmLabel, danger: true, icon: command.icon, onSelect: () => execute(command.title, command.run) },
      { key: '__cancel', title: 'Cancel', onSelect: pop },
    ];
  }, [page, query, commands, context, openCommand, execute, pop]);

  // Keep the selection on an enabled row.
  const enabledIndices = useMemo(() => rows.flatMap((row, index) => (row.disabled ? [] : [index])), [rows]);
  useEffect(() => {
    if (enabledIndices.length === 0) return;
    if (!enabledIndices.includes(selected)) setSelected(enabledIndices[0]);
  }, [enabledIndices, selected]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, rows]);

  if (!isOpen) return null;

  const move = (delta: 1 | -1) => {
    if (enabledIndices.length === 0) return;
    const position = enabledIndices.indexOf(selected);
    const next = position === -1 ? 0 : (position + delta + enabledIndices.length) % enabledIndices.length;
    setSelected(enabledIndices[next]);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        const row = rows[selected];
        if (row && !row.disabled) row.onSelect();
        else if (page.kind === 'input' && !query.trim()) setInputError(page.command.validate?.('') ?? 'Type a value first');
        break;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        if (stack.length > 1) pop();
        else close();
        break;
      case 'Backspace':
        if (!query && stack.length > 1) {
          event.preventDefault();
          pop();
        }
        break;
    }
  };

  const title = pageTitle(page);
  const placeholder =
    page.kind === 'root'
      ? 'Search commands and tools…'
      : page.kind === 'confirm'
        ? 'Press Enter to confirm, Esc to go back'
        : page.command.placeholder;

  let emptyText: string | null = null;
  if (rows.length === 0) {
    if (page.kind === 'root') emptyText = `No command matches “${query.trim()}”`;
    else if (page.kind === 'choices') {
      if (page.choices === null) emptyText = null;
      else if (page.error) emptyText = null;
      else emptyText = query.trim() ? `Nothing matches “${query.trim()}”` : page.command.emptyText ?? 'Nothing to choose from';
    }
  }

  const deviceName = context.selectedDevice ? context.selectedDevice.model || context.selectedDevice.id : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/50" onMouseDown={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command panel"
        // Keep focus in the search field so the keyboard always drives the panel.
        onMouseDown={(event) => {
          if (event.target !== inputRef.current) event.preventDefault();
        }}
        className="relative w-full max-w-xl mx-4 bg-surface-elevated border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-pop-in"
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-border-muted">
          {title ? (
            <button
              onClick={pop}
              className="flex items-center gap-1 h-6 pl-1 pr-2 -ml-1 rounded-md bg-surface-hover text-xs text-text-secondary hover:text-text-primary flex-shrink-0 transition-colors"
              title="Back (Backspace)"
            >
              <BackIcon />
              {title}
            </button>
          ) : (
            <span className="text-text-muted flex-shrink-0">
              <SearchIcon />
            </span>
          )}
          <input
            ref={inputRef}
            value={query}
            readOnly={page.kind === 'confirm'}
            onChange={(event) => {
              setQuery(event.target.value);
              setInputError(null);
              if (page.kind !== 'input') setSelected(0);
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 min-w-0 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none focus-visible:outline-none"
          />
          <span className="kbd">esc</span>
        </div>

        {page.kind === 'confirm' && (
          <div className="px-4 pt-3.5 pb-1">
            <p className="text-sm font-medium text-text-primary">{page.details.title}</p>
            <p className="text-sm text-text-secondary mt-1">{page.details.body}</p>
          </div>
        )}
        {page.kind === 'input' && (inputError || page.command.hint) && (
          <p className={`px-4 pt-3 text-xs ${inputError ? 'text-log-error' : 'text-text-muted'}`}>
            {inputError ?? page.command.hint}
          </p>
        )}

        <div ref={listRef} className="max-h-[min(420px,55vh)] overflow-y-auto p-1.5" role="listbox">
          {page.kind === 'choices' && page.choices === null && (
            <p className="px-3 py-6 text-center text-sm text-text-muted">Loading…</p>
          )}
          {page.kind === 'choices' && page.error && (
            <div className="px-3 py-5 text-center">
              <p className="text-sm text-text-primary">Couldn’t load this list</p>
              <p className="text-xs text-text-muted mt-1">{page.error}</p>
            </div>
          )}
          {emptyText && <p className="px-3 py-6 text-center text-sm text-text-muted">{emptyText}</p>}
          {page.kind === 'input' && rows.length === 0 && !inputError && (
            <p className="px-3 py-4 text-center text-xs text-text-muted">Type a value and press Enter</p>
          )}

          {rows.map((row, index) => {
            const isSelected = index === selected && !row.disabled;
            const showSection = row.section && row.section !== rows[index - 1]?.section;
            return (
              <React.Fragment key={row.key}>
                {showSection && (
                  <div className={`px-3 pb-1 text-[11px] font-medium text-text-muted ${index === 0 ? 'pt-1' : 'pt-3'}`}>
                    {row.section}
                  </div>
                )}
                <div
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={!!row.disabled}
                  onMouseMove={() => !row.disabled && index !== selected && setSelected(index)}
                  onClick={() => !row.disabled && row.onSelect()}
                  className={`flex items-center gap-3 h-9 px-3 rounded-md select-none ${
                    row.disabled
                      ? 'text-text-muted cursor-default'
                      : isSelected
                        ? `${row.danger ? 'bg-red-500/15 text-red-300' : 'bg-accent-muted text-text-primary'} cursor-pointer`
                        : `${row.danger ? 'text-red-300' : 'text-text-secondary'} cursor-pointer`
                  }`}
                >
                  {row.icon !== undefined && (
                    <span
                      className={`w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 flex-shrink-0 ${
                        row.disabled ? 'opacity-50' : isSelected ? (row.danger ? 'text-red-300' : 'text-accent') : 'text-text-muted'
                      }`}
                    >
                      {row.icon}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className={`text-[13px] truncate flex-shrink-0 max-w-full ${row.disabled ? 'opacity-70' : ''}`}>
                      <Highlighted text={row.title} indices={row.indices} />
                    </span>
                    {row.subtitle && !row.disabled && (
                      <span className="text-xs text-text-muted truncate min-w-0">{row.subtitle}</span>
                    )}
                  </span>
                  {row.disabled && <span className="text-[11px] text-text-muted flex-shrink-0">{row.disabled}</span>}
                  {row.badge && !row.disabled && (
                    <span className="text-[11px] text-text-muted flex-shrink-0">{row.badge}</span>
                  )}
                  {row.shortcut && !row.disabled && (
                    <span className="flex gap-0.5 flex-shrink-0">
                      {row.shortcut.map((key) => (
                        <span key={key} className="kbd">{key}</span>
                      ))}
                    </span>
                  )}
                  {row.opensPage && !row.disabled && (
                    <span className="text-text-muted flex-shrink-0">
                      <ChevronIcon />
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-4 h-9 px-4 border-t border-border-muted text-[11px] text-text-muted">
          <span className="flex-1 truncate">
            {deviceName ? (
              <>
                {deviceName}
                {context.packageName && <span className="font-mono"> · {context.packageName}</span>}
              </>
            ) : (
              'No device connected'
            )}
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            <span className="ml-0.5">Move</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">↵</span>
            <span className="ml-0.5">{page.kind === 'confirm' ? 'Confirm' : page.kind === 'root' ? 'Run' : 'Select'}</span>
          </span>
          {stack.length > 1 && (
            <span className="flex items-center gap-1">
              <span className="kbd">⌫</span>
              <span className="ml-0.5">Back</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
