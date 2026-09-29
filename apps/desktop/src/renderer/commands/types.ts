import type { ReactNode } from 'react';
import type { Device } from '@android-debugger/shared';
import type { TabId } from '../App';
import type { LogMode } from '../contexts/LogsContext';

/**
 * Everything a command may read or drive in the app. Built fresh by
 * CommandCenter on every render, so `when`/`hidden` always see live state.
 */
export interface CommandContext {
  devices: Device[];
  /** The selected device, whatever its status. */
  selectedDevice: Device | null;
  /** The selected device when it's ready for adb commands, otherwise null. */
  device: Device | null;
  /** Selected app package, or '' when none. */
  packageName: string;
  activeTab: TabId;
  sidebarExpanded: boolean;
  isRecording: boolean;
  isMirroring: boolean;
  logs: { isPaused: boolean; logMode: LogMode };

  navigate: (tab: TabId) => void;
  selectDevice: (device: Device) => void;
  selectPackage: (packageName: string) => void;
  refreshDevices: () => Promise<void>;
  toggleSidebar: () => void;
  clearLogView: () => Promise<void>;
  toggleLogPause: () => void;
  setLogMode: (mode: LogMode) => void;
  clearCrashes: () => void;
}

export type CommandGroupId =
  | 'device'
  | 'app'
  | 'capture'
  | 'dev-options'
  | 'logs'
  | 'window'
  | 'navigation';

export const COMMAND_GROUPS: { id: CommandGroupId; label: string }[] = [
  { id: 'device', label: 'Device' },
  { id: 'app', label: 'App' },
  { id: 'capture', label: 'Capture' },
  { id: 'dev-options', label: 'Developer options' },
  { id: 'logs', label: 'Logs' },
  { id: 'window', label: 'Window' },
  { id: 'navigation', label: 'Navigation' },
];

/** `true` when runnable, otherwise a short reason shown instead of running it. */
export type Availability = true | string;

export interface CommandChoice {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon?: ReactNode;
  /** Short trailing label, e.g. "Current". */
  badge?: string;
  disabled?: string;
  run: (ctx: CommandContext) => void | Promise<void>;
}

interface CommandBase {
  /** Stable id, e.g. "app.force-stop". Used for recents and future automation. */
  id: string;
  title: string;
  /** Extra words that should find this command. */
  keywords?: string[];
  group: CommandGroupId;
  icon?: ReactNode;
  /** Keys shown as hints, e.g. ['⌘', ',']. Global bindings live in CommandCenter. */
  shortcut?: string[];
  /** Hidden commands don't appear at all (e.g. "Stop recording" when idle). */
  hidden?: (ctx: CommandContext) => boolean;
  when?: (ctx: CommandContext) => Availability;
  /** Dynamic subtitle, e.g. the current value of a toggle. */
  subtitle?: (ctx: CommandContext) => string | undefined;
}

/** Runs immediately. The panel closes first; report results via toasts. */
export interface ActionCommand extends CommandBase {
  kind: 'action';
  run: (ctx: CommandContext) => void | Promise<void>;
}

/** Asks for confirmation inside the panel before running. */
export interface ConfirmCommand extends CommandBase {
  kind: 'confirm';
  confirm: (ctx: CommandContext) => { title: string; body: string; confirmLabel: string };
  run: (ctx: CommandContext) => void | Promise<void>;
}

/** Opens a sub-page listing choices, e.g. devices or apps. */
export interface ChoicesCommand extends CommandBase {
  kind: 'choices';
  placeholder: string;
  load: (ctx: CommandContext) => CommandChoice[] | Promise<CommandChoice[]>;
  emptyText?: string;
}

/** Opens a sub-page with a free-text field, e.g. a deep link URL. */
export interface InputCommand extends CommandBase {
  kind: 'input';
  placeholder: string;
  /** Helper text under the field. */
  hint?: string;
  /** Returns an error message for invalid input. */
  validate?: (value: string) => string | null;
  /** Suggestions (e.g. recent values) listed under the field. */
  suggestions?: (ctx: CommandContext) => string[];
  run: (ctx: CommandContext, value: string) => void | Promise<void>;
}

export type Command = ActionCommand | ConfirmCommand | ChoicesCommand | InputCommand;
