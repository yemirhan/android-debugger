/**
 * Host keyboard -> Android input translation for the in-app mirror. Pure, no
 * imports (unit tested from src/main).
 *
 * Like scrcpy's default "mixed" mode: printable characters are injected as
 * text (works with any keyboard layout and IME-less text fields), while
 * navigation/editing keys and Ctrl shortcuts are injected as key codes.
 */

export const ANDROID_KEYCODE = {
  HOME: 3,
  BACK: 4,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
  A: 29,
  TAB: 61,
  SPACE: 62,
  ENTER: 66,
  DEL: 67,
  MENU: 82,
  PAGE_UP: 92,
  PAGE_DOWN: 93,
  ESCAPE: 111,
  FORWARD_DEL: 112,
  MOVE_HOME: 122,
  MOVE_END: 123,
  INSERT: 124,
  F1: 131,
  APP_SWITCH: 187,
} as const;

export const ANDROID_META = {
  SHIFT_ON: 0x1,
  ALT_ON: 0x2,
  ALT_LEFT_ON: 0x10,
  SHIFT_LEFT_ON: 0x40,
  CTRL_ON: 0x1000,
  CTRL_LEFT_ON: 0x2000,
  META_ON: 0x10000,
  META_LEFT_ON: 0x20000,
} as const;

const SPECIAL_KEYS: Record<string, number> = {
  Enter: ANDROID_KEYCODE.ENTER,
  NumpadEnter: ANDROID_KEYCODE.ENTER,
  Backspace: ANDROID_KEYCODE.DEL,
  Delete: ANDROID_KEYCODE.FORWARD_DEL,
  Tab: ANDROID_KEYCODE.TAB,
  Escape: ANDROID_KEYCODE.ESCAPE,
  ArrowUp: ANDROID_KEYCODE.DPAD_UP,
  ArrowDown: ANDROID_KEYCODE.DPAD_DOWN,
  ArrowLeft: ANDROID_KEYCODE.DPAD_LEFT,
  ArrowRight: ANDROID_KEYCODE.DPAD_RIGHT,
  Home: ANDROID_KEYCODE.MOVE_HOME,
  End: ANDROID_KEYCODE.MOVE_END,
  PageUp: ANDROID_KEYCODE.PAGE_UP,
  PageDown: ANDROID_KEYCODE.PAGE_DOWN,
  Insert: ANDROID_KEYCODE.INSERT,
};

/** Physical keys usable in Ctrl shortcuts (Ctrl+A, Ctrl+Z...). */
const CODE_KEYS: Record<string, number> = {
  Space: ANDROID_KEYCODE.SPACE,
  Minus: 69,
  Equal: 70,
  BracketLeft: 71,
  BracketRight: 72,
  Backslash: 73,
  Semicolon: 74,
  Quote: 75,
  Slash: 76,
  Comma: 55,
  Period: 56,
  Backquote: 68,
};

function keycodeForCode(code: string): number | null {
  if (code in SPECIAL_KEYS) return SPECIAL_KEYS[code];
  if (code in CODE_KEYS) return CODE_KEYS[code];
  let match = /^Key([A-Z])$/.exec(code);
  if (match) return ANDROID_KEYCODE.A + (match[1].charCodeAt(0) - 65);
  match = /^Digit([0-9])$/.exec(code);
  if (match) return 7 + Number(match[1]);
  match = /^F([1-9]|1[0-2])$/.exec(code);
  if (match) return ANDROID_KEYCODE.F1 + Number(match[1]) - 1;
  return null;
}

export interface HostKeyEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export type KeyTranslation =
  | { kind: 'text'; text: string }
  | { kind: 'key'; keycode: number; metaState: number; repeat: number }
  | { kind: 'clipboard'; action: 'paste' | 'copy' | 'cut' }
  /** Not for the device: let the app handle it (e.g. Cmd+K). */
  | { kind: 'ignore' };

export function metaStateFor(event: Pick<HostKeyEvent, 'ctrlKey' | 'altKey' | 'shiftKey'>): number {
  let meta = 0;
  if (event.shiftKey) meta |= ANDROID_META.SHIFT_ON | ANDROID_META.SHIFT_LEFT_ON;
  if (event.altKey) meta |= ANDROID_META.ALT_ON | ANDROID_META.ALT_LEFT_ON;
  if (event.ctrlKey) meta |= ANDROID_META.CTRL_ON | ANDROID_META.CTRL_LEFT_ON;
  return meta;
}

/**
 * Translate a keydown/keyup. Text is only produced on keydown; key codes are
 * produced for both phases so the device sees matching down/up pairs.
 */
export function translateKeyEvent(event: HostKeyEvent, phase: 'down' | 'up'): KeyTranslation {
  // Cmd shortcuts belong to the host app, except clipboard ones.
  if (event.metaKey) {
    if (phase === 'down' && !event.ctrlKey && !event.altKey) {
      const lower = event.key.toLowerCase();
      if (event.code === 'KeyV' || lower === 'v') return { kind: 'clipboard', action: 'paste' };
      if (event.code === 'KeyC' || lower === 'c') return { kind: 'clipboard', action: 'copy' };
      if (event.code === 'KeyX' || lower === 'x') return { kind: 'clipboard', action: 'cut' };
    }
    return { kind: 'ignore' };
  }

  // Dead keys (accent composition) and IME composition cannot be mirrored.
  if (event.key === 'Dead' || event.key === 'Process' || event.key === 'Unidentified') return { kind: 'ignore' };

  const isPrintable = [...event.key].length === 1;
  if (isPrintable && !event.ctrlKey) {
    // Includes Shift/Option-composed characters; the host already applied
    // the keyboard layout, so inject the resulting character.
    return phase === 'down' ? { kind: 'text', text: event.key } : { kind: 'ignore' };
  }

  const keycode = keycodeForCode(event.code) ?? (event.key in SPECIAL_KEYS ? SPECIAL_KEYS[event.key] : null);
  if (keycode === null) return { kind: 'ignore' };
  return { kind: 'key', keycode, metaState: metaStateFor(event), repeat: event.repeat ? 1 : 0 };
}
