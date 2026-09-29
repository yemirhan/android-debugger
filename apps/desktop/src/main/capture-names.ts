/**
 * File names for captures saved without a dialog (command panel screenshot /
 * recording), modelled on macOS's own "Screenshot 2026-09-29 at 11.20.33.png".
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Keeps a device label safe for use in a file name on macOS, Windows and Linux. */
export function sanitizeFileLabel(label: string): string {
  return label
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function captureFileName(
  kind: 'screenshot' | 'recording',
  date: Date,
  deviceLabel?: string | null
): string {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} at ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  const label = deviceLabel ? sanitizeFileLabel(deviceLabel) : '';
  const base = `${kind === 'screenshot' ? 'Screenshot' : 'Recording'} ${stamp}${label ? ` (${label})` : ''}`;
  return `${base}.${kind === 'screenshot' ? 'png' : 'mp4'}`;
}
