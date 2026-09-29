/**
 * Android key names (KeyEvent.KEYCODE_*) accepted by MCP's press_key. `input
 * keyevent` silently ignores unknown names, so names are resolved here and
 * sent as numeric codes. Pure, for node:test.
 */
const NAMED: Record<string, number> = {
  HOME: 3,
  BACK: 4,
  CALL: 5,
  ENDCALL: 6,
  STAR: 17,
  POUND: 18,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  DPAD_CENTER: 23,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
  CAMERA: 27,
  CLEAR: 28,
  COMMA: 55,
  PERIOD: 56,
  TAB: 61,
  SPACE: 62,
  ENTER: 66,
  DEL: 67,
  MENU: 82,
  NOTIFICATION: 83,
  SEARCH: 84,
  MEDIA_PLAY_PAUSE: 85,
  MEDIA_STOP: 86,
  MEDIA_NEXT: 87,
  MEDIA_PREVIOUS: 88,
  PAGE_UP: 92,
  PAGE_DOWN: 93,
  ESCAPE: 111,
  FORWARD_DEL: 112,
  MOVE_HOME: 122,
  MOVE_END: 123,
  VOLUME_MUTE: 164,
  SETTINGS: 176,
  APP_SWITCH: 187,
  ASSIST: 219,
  BRIGHTNESS_DOWN: 220,
  BRIGHTNESS_UP: 221,
  SLEEP: 223,
  WAKEUP: 224,
  CUT: 277,
  COPY: 278,
  PASTE: 279,
  ALL_APPS: 284,
};

/** Aliases people commonly type. */
const ALIASES: Record<string, string> = {
  RECENTS: 'APP_SWITCH',
  RECENT_APPS: 'APP_SWITCH',
  OVERVIEW: 'APP_SWITCH',
  BACKSPACE: 'DEL',
  DELETE: 'FORWARD_DEL',
  RETURN: 'ENTER',
  ESC: 'ESCAPE',
  UP: 'DPAD_UP',
  DOWN: 'DPAD_DOWN',
  LEFT: 'DPAD_LEFT',
  RIGHT: 'DPAD_RIGHT',
  CENTER: 'DPAD_CENTER',
};

for (let digit = 0; digit <= 9; digit++) NAMED[String(digit)] = 7 + digit;
for (let letter = 0; letter < 26; letter++) NAMED[String.fromCharCode(65 + letter)] = 29 + letter;

export const ANDROID_KEY_NAMES: readonly string[] = Object.keys(NAMED).filter((name) => name.length > 1);

/** Key code for a name like "back", "KEYCODE_BACK" or "recents"; null when unknown. */
export function androidKeyCode(name: string): number | null {
  let key = name.trim().toUpperCase().replace(/^KEYCODE_/, '').replace(/[\s-]+/g, '_');
  key = ALIASES[key] ?? key;
  return Object.prototype.hasOwnProperty.call(NAMED, key) ? NAMED[key] : null;
}
