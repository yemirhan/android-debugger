/**
 * Parsers for the device's current Wi-Fi network.
 *
 * Both sources describe the *live* connection only. `dumpsys wifi` also lists
 * saved networks, scan results and connection history, all of which contain
 * `SSID:` fields for networks the device is no longer on; matching those is
 * what made the header keep showing an old network after switching Wi-Fi.
 */

export type WifiStatus =
  | { state: 'connected'; ssid: string }
  | { state: 'disconnected' }
  /** The output didn't look like a Wi-Fi status report (e.g. unsupported command). */
  | { state: 'unknown' };

const UNKNOWN_SSID = /^<?unknown ssid>?$/i;

/** Strips the quotes Android puts around UTF-8 SSIDs; rejects placeholder values. */
export function normalizeSsid(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  let ssid = raw.trim();
  if (ssid.length >= 2 && ssid.startsWith('"') && ssid.endsWith('"')) {
    ssid = ssid.slice(1, -1);
  }
  if (!ssid || UNKNOWN_SSID.test(ssid) || ssid === 'null' || ssid === '<none>') return null;
  return ssid;
}

/**
 * Extracts the SSID from a `WifiInfo.toString()` dump such as
 * `SSID: "Home", BSSID: 00:11:22:33:44:55, ... Supplicant state: COMPLETED, ...`.
 * Returns null unless the supplicant reports a completed association.
 */
export function parseWifiInfoLine(line: string): string | null {
  const supplicant = line.match(/Supplicant state:\s*([A-Z_]+)/)?.[1];
  if (supplicant && supplicant !== 'COMPLETED') return null;
  // SSIDs may contain commas, so anchor on the BSSID field that always follows.
  const quoted = line.match(/(?:^|[\s,])SSID:\s*(".*?"),\s*BSSID:/);
  if (quoted) return normalizeSsid(quoted[1]);
  const plain = line.match(/(?:^|[\s,])SSID:\s*(.*?),\s*BSSID:/);
  return normalizeSsid(plain?.[1]);
}

/**
 * Parses `adb shell cmd wifi status` (Android 11+). Output looks like:
 *
 *   Wifi is enabled
 *   ==== Primary ClientModeManager instance ====
 *   Wifi is connected to "AndroidWifi"
 *   WifiInfo: SSID: "AndroidWifi", BSSID: ..., Supplicant state: COMPLETED, ...
 *
 * or `Wifi is disabled` / `Wifi is not connected`. Only the primary client
 * mode manager (the first one printed) is considered.
 */
export function parseCmdWifiStatus(output: string): WifiStatus {
  const text = output.replace(/\r/g, '');
  if (/^\s*Wifi is disabled\b/im.test(text)) return { state: 'disconnected' };

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Wifi is not connected\b/i.test(trimmed)) return { state: 'disconnected' };
    const connected = trimmed.match(/^Wifi is connected to (.+)$/i);
    if (connected) {
      const ssid = normalizeSsid(connected[1]);
      return ssid ? { state: 'connected', ssid } : { state: 'disconnected' };
    }
    if (/^WifiInfo:/i.test(trimmed)) {
      const ssid = parseWifiInfoLine(trimmed);
      return ssid ? { state: 'connected', ssid } : { state: 'disconnected' };
    }
  }

  // "Wifi is enabled" with no client mode manager section means no connection.
  if (/^\s*Wifi is enabled\b/im.test(text)) return { state: 'disconnected' };
  return { state: 'unknown' };
}

/**
 * Fallback for older Android versions: reads the live `mWifiInfo` line of
 * `adb shell dumpsys wifi`, ignoring saved networks and history entries.
 */
export function parseDumpsysWifi(output: string): WifiStatus {
  const text = output.replace(/\r/g, '');
  if (/^\s*Wi-?Fi is disabled\b/im.test(text)) return { state: 'disconnected' };
  const infoLine = text.split('\n').find((line) => /^\s*mWifiInfo\s+SSID:/.test(line));
  if (!infoLine) {
    return /^\s*Wi-?Fi is enabled\b/im.test(text) ? { state: 'disconnected' } : { state: 'unknown' };
  }
  const ssid = parseWifiInfoLine(infoLine.trim().replace(/^mWifiInfo\s+/, ''));
  return ssid ? { state: 'connected', ssid } : { state: 'disconnected' };
}
