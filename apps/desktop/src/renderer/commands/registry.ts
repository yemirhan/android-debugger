import { useSyncExternalStore } from 'react';
import type { Command } from './types';

/**
 * Global command registry. Features register their commands here (typically
 * once at module load) and the command panel lists whatever is registered.
 *
 *   const unregister = registerCommands([{ id: 'my.cmd', kind: 'action', ... }]);
 */

let commands: Command[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Registers commands, replacing any with the same id. Returns an unregister function. */
export function registerCommands(list: Command[]): () => void {
  const ids = new Set(list.map((command) => command.id));
  commands = [...commands.filter((command) => !ids.has(command.id)), ...list];
  emit();
  return () => {
    const before = commands.length;
    commands = commands.filter((command) => !ids.has(command.id) || !list.includes(command));
    if (commands.length !== before) emit();
  };
}

export function getCommands(): Command[] {
  return commands;
}

export function getCommand(id: string): Command | undefined {
  return commands.find((command) => command.id === id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCommands(): Command[] {
  return useSyncExternalStore(subscribe, getCommands);
}

// ---- Recently used (shown first when the panel opens) ----

const RECENTS_KEY = 'android-debugger:recent-commands';
const MAX_RECENTS = 5;

export function getRecentCommandIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function recordRecentCommand(id: string): void {
  const next = [id, ...getRecentCommandIds().filter((existing) => existing !== id)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Best-effort
  }
}
