import type { Device } from '@android-debugger/shared';
import { getEmulatorState } from '../lib/emulators';

/**
 * Device and app actions behind the command panel, as plain async functions
 * with explicit arguments and no UI. They throw an Error with a readable
 * reason on failure, which keeps them reusable outside the panel (e.g. by a
 * future automation / MCP bridge).
 */

const api = () => window.electronAPI;

/** Android key codes used for React Native dev tooling. */
export const KEYCODE = {
  /** KEYCODE_R: RN's DoubleTapReloadRecognizer reloads on two R presses within 200 ms. */
  R: 46,
  /** KEYCODE_MENU: RN's ReactActivity opens the dev menu on the menu key. */
  MENU: 82,
} as const;

export function deviceLabel(device: Pick<Device, 'id' | 'model'>): string {
  // Emulators all report the same model; their AVD name tells them apart.
  if (device.id.startsWith('emulator-')) {
    const avd = getEmulatorState().avds.find((candidate) => candidate.serial === device.id);
    if (avd) return avd.displayName;
  }
  return device.model && device.model !== 'Unknown' ? device.model : device.id;
}

export async function launchApp(deviceId: string, packageName: string): Promise<void> {
  await api().launchApp(deviceId, packageName);
}

export async function forceStopApp(deviceId: string, packageName: string): Promise<void> {
  await api().killApp(deviceId, packageName);
}

export async function restartApp(deviceId: string, packageName: string): Promise<void> {
  await api().killApp(deviceId, packageName);
  await api().launchApp(deviceId, packageName);
}

export async function clearAppData(deviceId: string, packageName: string): Promise<void> {
  await api().clearAppData(deviceId, packageName);
}

export async function uninstallApp(deviceId: string, packageName: string): Promise<void> {
  await api().uninstallApp(deviceId, packageName);
}

export async function listDebuggableApps(deviceId: string): Promise<string[]> {
  const packages = await api().getPackages(deviceId, true);
  return [...packages].sort((a, b) => a.localeCompare(b));
}

/**
 * Reloads the JS bundle of a React Native debug build in the foreground by
 * sending KEYCODE_R twice in one `input keyevent` call (the "RR" shortcut).
 * Works for the app currently in the foreground only; release builds ignore it.
 */
export async function reloadReactNative(deviceId: string): Promise<void> {
  await api().sendKeyEvents(deviceId, [KEYCODE.R, KEYCODE.R]);
}

/** Opens the React Native dev menu (KEYCODE_MENU) in the foreground debug app. */
export async function openReactNativeDevMenu(deviceId: string): Promise<void> {
  await api().sendKeyEvents(deviceId, [KEYCODE.MENU]);
}

/** Saves a PNG into the captures folder (Pictures/Android Debugger) without a dialog. */
export async function takeScreenshot(device: Pick<Device, 'id' | 'model'>): Promise<string> {
  const result = await api().captureScreenshot(device.id, deviceLabel(device));
  return result.path;
}

export async function startRecording(device: Pick<Device, 'id' | 'model'>): Promise<string | undefined> {
  const result = await api().startRecordingToCaptures(device.id, deviceLabel(device));
  if (!result.success) throw new Error('Screen recording could not start. Another recording may already be running.');
  return result.path;
}

/** Stops the active recording (on whichever device it runs) and returns the saved file. */
export async function stopRecording(fallbackDeviceId: string): Promise<string | undefined> {
  const state = await api().getRecordingState();
  if (!state.isRecording) throw new Error('No recording is running');
  const result = await api().stopScreenRecording(state.deviceId ?? fallbackDeviceId);
  if (!result.success) throw new Error('The recording could not be saved');
  return result.path;
}

export class ScrcpyMissingError extends Error {
  constructor() {
    super('scrcpy is not installed yet');
  }
}

export async function startMirror(deviceId: string): Promise<void> {
  if (!(await api().checkScrcpy())) throw new ScrcpyMissingError();
  const result = await api().startMirror(deviceId, { stayAwake: true });
  if (!result.success) throw new Error(result.error || 'Screen mirror could not start');
}

export async function stopMirror(): Promise<void> {
  await api().stopMirror();
}

/** Returns an error message, or null when the URI looks launchable. */
export function validateDeepLink(uri: string): string | null {
  const value = uri.trim();
  if (!value) return 'Enter a link, e.g. myapp://profile/42';
  if (/\s/.test(value)) return 'Links cannot contain spaces';
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return 'Start with a scheme, e.g. myapp:// or https://';
  return null;
}

export async function openDeepLink(deviceId: string, uri: string): Promise<void> {
  const invalid = validateDeepLink(uri);
  if (invalid) throw new Error(invalid);
  const result = await api().fireDeepLink(deviceId, uri.trim());
  if (!result.success) throw new Error(result.error || 'No app on the device handled this link');
}

async function readDeveloperOptions(deviceId: string) {
  const options = await api().getDeveloperOptions(deviceId);
  if (!options) throw new Error('Could not read developer options from the device');
  return options;
}

function ensure(ok: boolean, what: string) {
  if (!ok) throw new Error(`The device refused to change ${what}`);
}

/** Toggles "Show layout bounds" and returns the new state. */
export async function toggleLayoutBounds(deviceId: string): Promise<boolean> {
  const next = !(await readDeveloperOptions(deviceId)).layoutBounds;
  ensure(await api().setLayoutBounds(deviceId, next), 'layout bounds');
  return next;
}

export async function toggleShowTouches(deviceId: string): Promise<boolean> {
  const next = !(await readDeveloperOptions(deviceId)).showTouches;
  ensure(await api().setShowTouches(deviceId, next), 'show touches');
  return next;
}

export async function togglePointerLocation(deviceId: string): Promise<boolean> {
  const next = !(await readDeveloperOptions(deviceId)).pointerLocation;
  ensure(await api().setPointerLocation(deviceId, next), 'pointer location');
  return next;
}

/** Sets window, transition and animator duration scales together (0 = off). */
export async function setAnimationScales(deviceId: string, scale: number): Promise<void> {
  const types = ['window', 'transition', 'animator'] as const;
  const results = await Promise.all(types.map((type) => api().setAnimationScale(deviceId, scale, type)));
  ensure(results.every(Boolean), 'animation scales');
}

/** A plain-text summary of a device, for pasting into bug reports. */
export async function describeDevice(device: Device): Promise<string> {
  const lines = [
    `Model: ${device.model}`,
    `Android: ${device.androidVersion}`,
    `Serial: ${device.id}`,
  ];
  try {
    const spec = await api().getDeviceSpec(device.id);
    if (spec.sdkVersion) lines.push(`API level: ${spec.sdkVersion}`);
    if (spec.abis?.length) lines.push(`ABIs: ${spec.abis.join(', ')}`);
    if (spec.screenDensity) lines.push(`Density: ${spec.screenDensity} dpi`);
  } catch {
    // The basics above are still useful without the spec.
  }
  lines.push(`Wi-Fi: ${device.wifiName?.trim() || 'Not connected'}`);
  return lines.join('\n');
}

export async function copyText(text: string): Promise<void> {
  await api().writeClipboardText(text);
}
