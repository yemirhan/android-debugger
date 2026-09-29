/**
 * Pure helpers for talking to a React Native dev server (Metro) and the
 * React Native DevTools frontend it hosts. No Node or Electron imports so this
 * can be unit-tested with node:test and type-checked from the renderer.
 *
 * Metro's inspector proxy (@react-native/dev-middleware, RN 0.73+) lists
 * debuggable targets at GET /json/list:
 *
 *   {
 *     id: "<logicalDeviceId>-<pageId>",
 *     title: "com.example.app (Pixel 8)",            // RN 0.81; older: "React Native Bridgeless [C++ connection]"
 *     description: "React Native Bridgeless [C++ connection]",  // older: the app id
 *     appId: "com.example.app",
 *     type: "node",
 *     devtoolsFrontendUrl: "/debugger-frontend/rn_fusebox.html?ws=...",
 *     webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?device=...&page=1",
 *     deviceName: "sdk_gphone64_arm64 - 16 - API 36",
 *     reactNative: { logicalDeviceId, capabilities: { nativePageReloads, prefersFuseboxFrontend, ... } }
 *   }
 *
 * `devtoolsFrontendUrl` is relative to the host the list was requested from
 * (RN 0.74+), absolute on older 0.73 builds, and a `devtools://` URL on the
 * legacy metro-inspector-proxy (RN < 0.73) that only Chrome itself can open.
 */

export const DEFAULT_METRO_PORT = 8081;

/** Session partition used by every embedded DevTools webview. */
export const RN_DEVTOOLS_PARTITION = 'persist:rn-devtools';

/** Title of the synthetic page older RN versions (0.73–0.75) expose for reload-safe debugging. */
export const LEGACY_SYNTHETIC_PAGE_TITLE = 'React Native Experimental (Improved Chrome Reloads)';

export type RnDevtoolsFrontend =
  /** RN 0.76+: the React Native DevTools ("Fusebox") frontend. */
  | 'fusebox'
  /** RN 0.73–0.75: Chrome DevTools-based inspector served by Metro. */
  | 'inspector'
  /** RN < 0.73 or other servers: a frontend Metro doesn't serve (devtools://). */
  | 'external';

export interface RnDevtoolsTarget {
  id: string;
  title: string;
  description: string | null;
  appId: string | null;
  deviceName: string | null;
  logicalDeviceId: string | null;
  /** Absolute http(s) URL of the frontend on the Metro origin, or null when it can't be embedded. */
  frontendUrl: string | null;
  /** Raw devtoolsFrontendUrl as reported by Metro. */
  rawFrontendUrl: string | null;
  webSocketDebuggerUrl: string | null;
  frontend: RnDevtoolsFrontend;
  /** Survives JS reloads (what `/open-debugger` restricts itself to). */
  reloadSafe: boolean;
}

export type MetroProbe =
  | { state: 'not-running'; port: number }
  | { state: 'not-metro'; port: number; origin: string }
  | {
      state: 'running';
      port: number;
      origin: string;
      /** False when the server has no inspector proxy (/json/list missing). */
      inspector: boolean;
      targets: RnDevtoolsTarget[];
    };

export function parseMetroPort(value: unknown): number | null {
  const port = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** True for http(s) URLs pointing at this machine — the only origins a DevTools webview may load. */
export function isLocalDevUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/** Metro's /status endpoint answers with exactly this body. */
export function isMetroStatusBody(body: string): boolean {
  return body.trim() === 'packager-status:running';
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Turns Metro's devtoolsFrontendUrl into something a webview can load: relative
 * paths resolve against the Metro origin; absolute URLs must stay on this machine.
 */
export function resolveFrontendUrl(raw: string | null, origin: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    try {
      return new URL(raw, origin).toString();
    } catch {
      return null;
    }
  }
  return isLocalDevUrl(raw) ? raw : null;
}

function frontendKind(raw: string | null, resolved: string | null): RnDevtoolsFrontend {
  if (!resolved) return 'external';
  if (raw && /rn_fusebox\.html/.test(raw)) return 'fusebox';
  return 'inspector';
}

export function parseMetroTargets(json: unknown, origin: string): RnDevtoolsTarget[] {
  if (!Array.isArray(json)) return [];
  const targets: RnDevtoolsTarget[] = [];
  for (const entry of json) {
    if (!entry || typeof entry !== 'object') continue;
    const page = entry as Record<string, unknown>;
    const id = str(page.id);
    if (!id) continue;
    const rn = page.reactNative && typeof page.reactNative === 'object' ? (page.reactNative as Record<string, unknown>) : {};
    const capabilities =
      rn.capabilities && typeof rn.capabilities === 'object' ? (rn.capabilities as Record<string, unknown>) : {};
    const rawFrontendUrl = str(page.devtoolsFrontendUrl);
    const frontendUrl = resolveFrontendUrl(rawFrontendUrl, origin);
    const title = str(page.title) ?? 'React Native';
    targets.push({
      id,
      title,
      description: str(page.description),
      appId: str(page.appId) ?? str(page.description),
      deviceName: str(page.deviceName),
      logicalDeviceId: str(rn.logicalDeviceId),
      frontendUrl,
      rawFrontendUrl,
      webSocketDebuggerUrl: str(page.webSocketDebuggerUrl),
      frontend: frontendKind(rawFrontendUrl, frontendUrl),
      reloadSafe: capabilities.nativePageReloads === true || title === LEGACY_SYNTHETIC_PAGE_TITLE,
    });
  }
  return targets;
}

/**
 * RN reports emulators as "<model> - <release> - API <sdk>" and physical
 * devices as "<model>"; `model` is `ro.product.model` from adb.
 */
export function deviceNameMatches(deviceName: string | null, model: string | null | undefined): boolean {
  if (!deviceName || !model) return false;
  const name = deviceName.trim().toLowerCase();
  const wanted = model.trim().toLowerCase();
  return name === wanted || name.startsWith(`${wanted} - `);
}

export interface TargetContext {
  packageName?: string | null;
  deviceModel?: string | null;
}

/** Higher is better; used to order the picker and pick a default target. */
export function scoreTarget(target: RnDevtoolsTarget, context: TargetContext): number {
  let score = 0;
  if (context.packageName && target.appId === context.packageName) score += 8;
  if (deviceNameMatches(target.deviceName, context.deviceModel)) score += 4;
  if (target.reloadSafe) score += 2;
  if (target.frontendUrl) score += 1;
  return score;
}

/**
 * Orders targets best-first. Ties keep Metro's order reversed so the most
 * recently connected target wins, like `/open-debugger` does.
 */
export function rankTargets(targets: RnDevtoolsTarget[], context: TargetContext): RnDevtoolsTarget[] {
  return targets
    .map((target, index) => ({ target, index, score: scoreTarget(target, context) }))
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .map(({ target }) => target);
}

/**
 * Stable identity for a target across app restarts: page ids change when the
 * app process restarts, but the app, device and page kind stay the same.
 */
export function targetKey(target: Pick<RnDevtoolsTarget, 'appId' | 'logicalDeviceId' | 'deviceName' | 'title'>): string {
  return [target.logicalDeviceId ?? target.deviceName ?? '', target.appId ?? '', target.title].join('|');
}

/**
 * Picks which target to show. Keeps the current one (by id, then by stable key
 * so a restarted app reconnects), otherwise the best-ranked one.
 */
export function chooseTarget(
  targets: RnDevtoolsTarget[],
  context: TargetContext,
  current: { id: string | null; key: string | null }
): RnDevtoolsTarget | null {
  if (targets.length === 0) return null;
  if (current.id) {
    const same = targets.find((target) => target.id === current.id);
    if (same) return same;
  }
  const ranked = rankTargets(targets, context);
  if (current.key) {
    const sameKey = ranked.find((target) => targetKey(target) === current.key);
    if (sameKey) return sameKey;
  }
  return ranked[0];
}

/** True when `adb reverse --list` output forwards device tcp:<port> to host tcp:<port>. */
export function reverseListHasPort(stdout: string, port: number): boolean {
  const wanted = `tcp:${port}`;
  return stdout.split(/\r?\n/).some((line) => {
    const parts = line.trim().split(/\s+/);
    return parts.length >= 3 && parts[parts.length - 2] === wanted && parts[parts.length - 1] === wanted;
  });
}

/** Commands understood by React Native apps on Metro's /message socket. */
export type MetroAppCommand = 'reload' | 'devMenu';

export function serializeMetroMessage(message: Record<string, unknown>): string {
  return JSON.stringify({ ...message, version: 2 });
}

/** Parses a /message socket reply; returns null for anything that isn't protocol v2 JSON. */
export function parseMetroMessage(data: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' && parsed.version === 2 ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
