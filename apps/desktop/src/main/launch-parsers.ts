/**
 * Parsers for launching an app's launcher activity.
 *
 * `monkey -p <pkg> -c LAUNCHER 1` (the previous approach) aborts on devices
 * and emulators without physical system keys ("SYS_KEYS has no physical keys
 * but with factor 2.0%") and gives no usable error, so the activity is
 * resolved explicitly and started with `am start -n`.
 */

const COMPONENT = /^([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\/([A-Za-z0-9_.$]+)$/;

/**
 * Reads `cmd package resolve-activity --brief …` output. The component is the
 * last line (e.g. `com.example/.MainActivity`); "No activity found" → null.
 */
export function parseResolvedActivity(output: string, packageName: string): string | null {
  const lines = output.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(COMPONENT);
    if (match && match[1] === packageName) return lines[index];
  }
  return null;
}

/** Returns the failure reason from `am start` output, or null when it started. */
export function parseAmStartError(output: string): string | null {
  const text = output.replace(/\r/g, '');
  const error = text.match(/^Error(?: type \d+)?:\s*(.+)$/m)?.[1]?.trim();
  if (error) return error;
  const exception = text.match(/^(?:java\.lang\.|android\.\S+\.)?\w*Exception:\s*(.+)$/m)?.[1]?.trim();
  if (exception) return exception;
  return null;
}
