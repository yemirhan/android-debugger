/**
 * Pure helpers behind the emulator (AVD) manager: SDK discovery rules, INI
 * and tool-output parsers, argument builders and validation. No I/O here, so
 * everything is unit-tested against captured output (emulator-parsers.test.ts).
 */
import type {
  AvdInfo,
  CreateAvdRequest,
  DeviceProfile,
  DeviceProfileCategory,
  HostAbi,
  StartAvdOptions,
  SystemImage,
} from './emulator-types';

// ---------- INI ----------

/** Parses `key = value` / `key=value` lines (AVD .ini, config.ini, source.properties). */
export function parseIni(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    // source.properties escapes ':' and '=' Java-properties style.
    const value = line.slice(index + 1).trim().replace(/\\([:=\\])/g, '$1');
    if (key) result[key] = value;
  }
  return result;
}

/** Sets keys in INI text, keeping every other line (and each line's spacing style) intact. */
export function updateIniText(text: string, patch: Record<string, string>): string {
  const remaining = new Map(Object.entries(patch));
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    const match = /^(\s*)([^=#;\s][^=]*?)(\s*=\s*)(.*)$/.exec(line);
    if (!match) return line;
    const key = match[2].trim();
    if (!remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${match[1]}${key}${match[3]}${value}`;
  });
  // Drop trailing empty lines, append new keys, end with a newline.
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  const spaced = lines.some((line) => /\s=\s/.test(line));
  for (const [key, value] of remaining) out.push(spaced ? `${key} = ${value}` : `${key}=${value}`);
  return `${out.join('\n')}\n`;
}

// ---------- sizes ----------

const UNIT: Record<string, number> = { '': 1, B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

/** "6442450944", "6G", "800MB", "512 MB" → bytes. A bare number means bytes. */
export function parseSizeToBytes(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([KMGT]?)i?B?\s*$/i.exec(value);
  if (!match) return null;
  const bytes = Number(match[1]) * UNIT[match[2].toUpperCase()];
  return Number.isFinite(bytes) ? Math.round(bytes) : null;
}

/** hw.ramSize: "2G", "2048", "2048M", "1536MB" → MB. A bare number means MB. */
export function parseRamMb(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([KMGT]?)i?B?\s*$/i.exec(value);
  if (!match) return null;
  const unit = match[2].toUpperCase();
  const amount = Number(match[1]);
  const mb = unit === '' || unit === 'M' ? amount : unit === 'G' ? amount * 1024 : unit === 'T' ? amount * 1024 * 1024 : amount / 1024;
  return Number.isFinite(mb) && mb > 0 ? Math.round(mb) : null;
}

// ---------- API levels & system images ----------

const ANDROID_VERSION_BY_API: Record<number, string> = {
  16: '4.1',
  17: '4.2',
  18: '4.3',
  19: '4.4',
  20: '4.4W',
  21: '5.0',
  22: '5.1',
  23: '6.0',
  24: '7.0',
  25: '7.1',
  26: '8.0',
  27: '8.1',
  28: '9',
  29: '10',
  30: '11',
  31: '12',
  32: '12L',
  33: '13',
  34: '14',
  35: '15',
  36: '16',
  37: '17',
};

/** "36", "36.1", "35-ext14" → "16", "16", "15". Unknown/preview levels → null. */
export function androidVersionForApi(apiLevel: string | null | undefined): string | null {
  const major = Number(/^(\d+)/.exec(apiLevel ?? '')?.[1]);
  return Number.isFinite(major) ? ANDROID_VERSION_BY_API[major] ?? null : null;
}

/** Sort key for API levels: numeric part first, extensions/minor versions after. */
export function apiSortKey(apiLevel: string): number {
  const match = /^(\d+)(?:\.(\d+))?(?:-ext(\d+))?/.exec(apiLevel);
  if (!match) return 10_000; // CANARY / previews sort above released levels
  return Number(match[1]) * 100 + Number(match[2] ?? 0) * 10 + Number(match[3] ?? 0) / 100;
}

/** "android-36" → "36", "android-35-ext14" → "35-ext14", "android-CANARY" → "CANARY". */
export function platformToApiLevel(platform: string): string {
  return platform.replace(/^android-/, '');
}

const TAG_DISPLAY: Record<string, string> = {
  default: 'Android Open Source',
  google_apis: 'Google APIs',
  google_apis_playstore: 'Google Play',
  google_apis_ps16k: 'Google APIs, 16 KB pages',
  google_apis_playstore_ps16k: 'Google Play, 16 KB pages',
  google_apis_tablet: 'Google APIs Tablet',
  google_apis_playstore_tablet: 'Google Play Tablet',
  google_atd: 'Google APIs ATD',
  aosp_atd: 'AOSP ATD',
  'android-tv': 'Android TV',
  'google-tv': 'Google TV',
  'android-wear': 'Wear OS',
  'android-wear-signed': 'Wear OS',
  'android-automotive': 'Android Automotive',
  'android-automotive-playstore': 'Android Automotive with Google Play',
  'android-desktop': 'Android Desktop',
};

export function tagDisplayName(tagId: string): string {
  return TAG_DISPLAY[tagId] ?? tagId.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function isPlayStoreTag(tagId: string | null | undefined): boolean {
  return !!tagId && /playstore/.test(tagId);
}

const PACKAGE_PART = /^[A-Za-z0-9._-]+$/;

/** "system-images;android-36;google_apis;arm64-v8a" → its parts, or null when malformed. */
export function parseSystemImageId(id: string): { platform: string; tagId: string; abi: string } | null {
  const parts = id.split(';');
  if (parts.length !== 4 || parts[0] !== 'system-images') return null;
  const [, platform, tagId, abi] = parts;
  if (![platform, tagId, abi].every((part) => PACKAGE_PART.test(part))) return null;
  return { platform, tagId, abi };
}

export function isValidSystemImageId(id: unknown): id is string {
  return typeof id === 'string' && parseSystemImageId(id) !== null;
}

/** config.ini's image.sysdir.1 ("system-images/android-36/google_apis/arm64-v8a/") → package id. */
export function systemImageIdFromSysdir(sysdir: string | undefined | null): string | null {
  if (!sysdir) return null;
  const parts = sysdir.replace(/\\/g, '/').split('/').filter(Boolean);
  const start = parts.lastIndexOf('system-images');
  if (start < 0 || parts.length < start + 4) return null;
  const id = ['system-images', ...parts.slice(start + 1, start + 4)].join(';');
  return parseSystemImageId(id) ? id : null;
}

export function systemImageFromId(
  id: string,
  extra: { description?: string; revision?: string | null; installed?: boolean; path?: string | null; tagDisplay?: string; apiLevel?: string } = {}
): SystemImage | null {
  const parts = parseSystemImageId(id);
  if (!parts) return null;
  const apiLevel = extra.apiLevel ?? platformToApiLevel(parts.platform);
  return {
    id,
    platform: parts.platform,
    apiLevel,
    androidVersion: androidVersionForApi(apiLevel),
    tagId: parts.tagId,
    tagDisplay: extra.tagDisplay || tagDisplayName(parts.tagId),
    abi: parts.abi,
    description: extra.description ?? '',
    revision: extra.revision ?? null,
    installed: extra.installed ?? false,
    path: extra.path ?? null,
    playStore: isPlayStoreTag(parts.tagId),
  };
}

/** Builds a SystemImage from an installed image's source.properties. */
export function systemImageFromSourceProperties(
  platformDir: string,
  props: Record<string, string>,
  imagePath: string
): SystemImage | null {
  const tagId = props['SystemImage.TagId'];
  const abi = props['SystemImage.Abi'];
  if (!tagId || !abi) return null;
  const id = `system-images;${platformDir};${tagId};${abi}`;
  const ext = props['AndroidVersion.ExtensionLevel'];
  const base = props['AndroidVersion.ApiLevel'];
  // Extension images live in android-35-ext14; keep that distinction visible.
  const apiLevel = /-ext\d+$/.test(platformDir) && base && ext ? `${base}-ext${ext}` : base || platformToApiLevel(platformDir);
  return systemImageFromId(id, {
    description: props['Pkg.Desc'] ?? '',
    revision: props['Pkg.Revision'] ?? null,
    installed: true,
    path: imagePath,
    tagDisplay: props['SystemImage.TagDisplay'],
    apiLevel,
  });
}

export function hostAbiFor(arch: string): HostAbi {
  return arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
}

/** ABIs a host can run at full speed. */
export function abisForHost(hostAbi: HostAbi): string[] {
  return hostAbi === 'arm64-v8a' ? ['arm64-v8a'] : ['x86_64', 'x86'];
}

/** Canary and beta images: listed after stable ones and hidden by default. */
export function isPreviewApi(apiLevel: string): boolean {
  return /canary|beta|preview|rc\d/i.test(apiLevel) || !/^\d/.test(apiLevel);
}

/** Stable before previews, newest API first, then Google Play, Google APIs, the rest. */
export function compareSystemImages(a: SystemImage, b: SystemImage): number {
  const preview = Number(isPreviewApi(a.apiLevel)) - Number(isPreviewApi(b.apiLevel));
  if (preview !== 0) return preview;
  const api = apiSortKey(b.apiLevel) - apiSortKey(a.apiLevel);
  if (api !== 0) return api;
  const rank = (image: SystemImage) =>
    image.tagId === 'google_apis_playstore' ? 0 : image.tagId === 'google_apis' ? 1 : image.tagId === 'default' ? 2 : 3;
  return rank(a) - rank(b) || a.id.localeCompare(b.id);
}

// ---------- AVDs ----------

function yes(value: string | undefined): boolean {
  return value === 'yes' || value === 'true';
}

function meaningful(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && !/^<.*>$/.test(trimmed) ? trimmed : null;
}

/**
 * Describes an AVD from <name>.ini + <name>.avd/config.ini (+ the system
 * image's source.properties when installed). Run state and disk size are
 * filled in by the service.
 */
export function describeAvd(input: {
  name: string;
  topIni: Record<string, string>;
  config: Record<string, string>;
  path: string;
  image?: SystemImage | null;
}): Omit<AvdInfo, 'state' | 'serial' | 'boot' | 'sizeOnDiskBytes' | 'snapshots'> {
  const { name, config, topIni, image } = input;
  const systemImage = systemImageIdFromSysdir(config['image.sysdir.1']);
  const parts = systemImage ? parseSystemImageId(systemImage) : null;
  const tagId = meaningful(config['tag.id']) ?? parts?.tagId ?? null;
  const apiLevel =
    image?.apiLevel ?? (parts ? platformToApiLevel(parts.platform) : null) ?? (topIni.target ? platformToApiLevel(topIni.target) : null);
  const width = Number(config['hw.lcd.width']);
  const height = Number(config['hw.lcd.height']);
  const density = Number(config['hw.lcd.density']);
  const sdCardSize = meaningful(config['sdcard.size']);
  let problem: string | null = null;
  if (!systemImage) problem = 'The system image is not set in config.ini';
  else if (image === null) problem = `The system image ${systemImage} is not installed`;
  return {
    name,
    displayName: meaningful(config['avd.ini.displayname']) ?? name.replace(/_/g, ' '),
    deviceProfile: meaningful(config['hw.device.name']),
    deviceManufacturer: meaningful(config['hw.device.manufacturer']),
    apiLevel,
    androidVersion: androidVersionForApi(apiLevel),
    abi: meaningful(config['abi.type']) ?? parts?.abi ?? null,
    tagId,
    tagDisplay: image?.tagDisplay ?? meaningful(config['tag.display']) ?? (tagId ? tagDisplayName(tagId) : null),
    playStore: yes(config['PlayStore.enabled']) || isPlayStoreTag(tagId),
    systemImage,
    systemImageInstalled: !!image,
    ramMb: parseRamMb(config['hw.ramSize']),
    storageBytes: parseSizeToBytes(config['disk.dataPartition.size']),
    sdCard: sdCardSize ? sdCardSize.replace(/\s+/g, ' ') : meaningful(config['sdcard.path']) ? 'Custom image' : null,
    screen: width > 0 && height > 0 ? { width, height, density: density > 0 ? density : null } : null,
    path: input.path,
    problem,
  };
}

/** Where AVDs live: ANDROID_AVD_HOME, ANDROID_USER_HOME/avd, ANDROID_SDK_HOME/.android/avd, ~/.android/avd. */
export function avdHomeFor(env: Record<string, string | undefined>, home: string, join: (...parts: string[]) => string): string {
  if (env.ANDROID_AVD_HOME) return env.ANDROID_AVD_HOME;
  if (env.ANDROID_USER_HOME) return join(env.ANDROID_USER_HOME, 'avd');
  if (env.ANDROID_SDK_HOME) return join(env.ANDROID_SDK_HOME, '.android', 'avd');
  return join(home, '.android', 'avd');
}

/** `emulator -list-avds` prints one name per line (plus INFO/WARNING noise on some versions). */
export function parseListAvds(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(INFO|WARNING|ERROR)\b/.test(line) && !line.includes('|') && isValidAvdName(line));
}

/** Files and folders wiped from an AVD folder to reset it to factory state. */
export function wipeTargets(entries: string[]): string[] {
  return entries.filter(
    (entry) =>
      entry === 'userdata-qemu.img' ||
      entry === 'cache.img' ||
      entry === 'snapshots' ||
      entry.endsWith('.qcow2') ||
      entry === 'bootcompleted.ini'
  );
}

/** hardware-qemu.ini.lock / *.lock files hold the running emulator's PID. */
export function parseLockPid(text: string): number | null {
  const pid = Number(/^\s*(\d+)/.exec(text)?.[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Whether a process's executable (`ps -o comm=`, or a Windows image name) is
 * the emulator: the launcher execs into qemu-system-*, so the lock file's PID
 * is qemu. Matches the file name only, so helpers that merely live in the
 * SDK's emulator/ folder (crashpad_handler, netsimd) don't count.
 */
export function isEmulatorExecutable(command: string): boolean {
  const base = command.trim().split(/[\\/]/).pop() ?? '';
  return /^(qemu-system-[\w.-]+|emulator(64-[\w-]+)?)(\.exe)?$/i.test(base);
}

/** The AVD an emulator process runs, from its command line (`-avd <name>` or `@<name>`). */
export function avdNameFromCommandLine(commandLine: string): string | null {
  const name = /(?:^|\s)(?:-avd\s+|@)([A-Za-z0-9._-]+)(?=\s|$)/.exec(commandLine)?.[1] ?? null;
  return name && isValidAvdName(name) ? name : null;
}

export function sameAvdName(a: string, b: string): boolean {
  // AVD folders live on case-insensitive file systems on macOS and Windows.
  return a.toLowerCase() === b.toLowerCase();
}

interface PathApi {
  isAbsolute(value: string): boolean;
  relative(from: string, to: string): string;
  basename(value: string): string;
  resolve(...values: string[]): string;
  sep: string;
}

function isInsideOrSame(parent: string, child: string, api: PathApi): boolean {
  const relative = api.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${api.sep}`) && !api.isAbsolute(relative));
}

/**
 * Why an AVD folder must not be deleted or wiped, or null when it may be.
 * `folder` comes from the AVD's .ini `path`, which can point anywhere, so it
 * must look like an AVD folder (<something>.avd, absolute), must not contain
 * the AVD home, and must not be (or overlap) another AVD's folder. Paths
 * should already be resolved with realpath.
 */
export function avdFolderProblem(
  folder: string,
  avdHome: string,
  otherAvdFolders: readonly string[],
  options: { api: PathApi; caseInsensitive: boolean }
): string | null {
  const { api } = options;
  const norm = (value: string) => {
    const resolved = api.resolve(value);
    return options.caseInsensitive ? resolved.toLowerCase() : resolved;
  };
  if (!api.isAbsolute(folder)) return `${folder} is not an absolute path`;
  const target = norm(folder);
  const base = api.basename(target);
  if (!base.endsWith('.avd') || base.length <= 4) return `${folder} does not look like an emulator folder`;
  if (isInsideOrSame(target, norm(avdHome), api)) return `${folder} contains the emulator home folder`;
  for (const other of otherAvdFolders) {
    if (!other) continue;
    const normalized = norm(other);
    if (isInsideOrSame(target, normalized, api) || isInsideOrSame(normalized, target, api)) {
      return `${folder} is shared with another emulator (${other})`;
    }
  }
  return null;
}

// ---------- names ----------

const AVD_NAME = /^[A-Za-z0-9._-]+$/;

export function isValidAvdName(name: string): boolean {
  return AVD_NAME.test(name) && name.length <= 64 && !name.startsWith('.');
}

/** Returns a problem to show, or null when the name can be used. */
export function validateAvdName(name: string, existing: readonly string[]): string | null {
  const value = name.trim();
  if (!value) return 'Enter a name';
  if (value.length > 64) return 'Use 64 characters or fewer';
  if (!AVD_NAME.test(value)) return 'Use letters, digits, dots, dashes and underscores only';
  if (value.startsWith('.')) return 'The name cannot start with a dot';
  // AVD folders live on case-insensitive file systems on macOS and Windows.
  if (existing.some((other) => other.toLowerCase() === value.toLowerCase())) return 'An emulator with this name already exists';
  return null;
}

/** "Pixel 8" + API 36 → "Pixel_8_API_36", made unique against `existing`. */
export function suggestAvdName(profileName: string, apiLevel: string | null, existing: readonly string[]): string {
  const base =
    [profileName, apiLevel ? `API ${apiLevel}` : '']
      .join(' ')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_.]+|_+$/g, '')
      .slice(0, 56) || 'Emulator';
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}_${Date.now()}`;
}

// ---------- device profiles (avdmanager list device) ----------

export function categorizeDevice(id: string, name: string, tag: string | null): DeviceProfileCategory {
  const t = tag ?? '';
  if (/wear/.test(t)) return 'wear';
  if (/tv/.test(t)) return 'tv';
  if (/automotive/.test(t)) return 'automotive';
  if (/desktop/.test(t)) return 'desktop';
  if (/xr/.test(t)) return 'xr';
  if (t && !/^default$/.test(t)) return 'other';
  if (/tablet|fold|Nexus (7|9|10)\b|pixel_c\b|Pixel C\b/i.test(`${id} ${name}`)) return 'tablet';
  return 'phone';
}

/** Parses `avdmanager list device` (the long form, which has names and tags). */
export function parseDeviceProfiles(stdout: string): DeviceProfile[] {
  const profiles: DeviceProfile[] = [];
  let current: { id: string; name?: string; oem?: string; tag?: string } | null = null;
  const flush = () => {
    if (!current) return;
    const tag = current.tag ?? null;
    profiles.push({
      id: current.id,
      name: current.name ?? current.id,
      oem: current.oem ?? null,
      tag,
      category: categorizeDevice(current.id, current.name ?? current.id, tag),
    });
    current = null;
  };
  for (const line of stdout.split(/\r?\n/)) {
    const idMatch = /^id:\s*\d+\s+or\s+"(.+)"\s*$/.exec(line.trim());
    if (idMatch) {
      flush();
      current = { id: idMatch[1] };
      continue;
    }
    if (!current) continue;
    const field = /^\s*(Name|OEM|Tag)\s*:\s*(.*)$/.exec(line);
    if (field) {
      const value = field[2].trim();
      if (field[1] === 'Name') current.name = value;
      else if (field[1] === 'OEM') current.oem = value;
      else current.tag = value.split(',')[0].trim() || undefined;
    } else if (/^-{3,}/.test(line.trim())) {
      flush();
    }
  }
  flush();
  return profiles;
}

/** Pixels newest first, then generic sizes, then everything else alphabetically. */
export function sortDeviceProfiles(profiles: readonly DeviceProfile[]): DeviceProfile[] {
  const rank = (profile: DeviceProfile) => (/^pixel/i.test(profile.id) ? 0 : /^(small|medium|large)_|resizable/i.test(profile.id) ? 1 : 2);
  return [...profiles].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    const order = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return rank(a) === 0 ? -order : order;
  });
}

const PREFERRED_PROFILES = ['pixel_9', 'pixel_8', 'pixel_7', 'pixel_6', 'medium_phone', 'pixel_5', 'pixel_4'];

export function defaultDeviceProfile(profiles: readonly DeviceProfile[]): DeviceProfile | null {
  for (const id of PREFERRED_PROFILES) {
    const found = profiles.find((profile) => profile.id === id);
    if (found) return found;
  }
  return profiles.find((profile) => profile.category === 'phone') ?? profiles[0] ?? null;
}

/** Which profile categories suit a system image tag (a TV image needs a TV profile). */
export function profileCategoriesForTag(tagId: string | null | undefined): DeviceProfileCategory[] {
  const tag = tagId ?? '';
  if (/wear/.test(tag)) return ['wear'];
  if (/tv/.test(tag)) return ['tv'];
  if (/automotive/.test(tag)) return ['automotive'];
  if (/desktop/.test(tag)) return ['desktop'];
  if (/xr/.test(tag)) return ['xr'];
  return ['phone', 'tablet', 'other'];
}

// ---------- sdkmanager --list ----------

export interface SdkListRow {
  path: string;
  version: string;
  description: string;
  location?: string;
}

export interface SdkListResult {
  installed: SdkListRow[];
  available: SdkListRow[];
}

/** Parses `sdkmanager --list` tables ("Installed packages:", "Available Packages:"). */
export function parseSdkmanagerList(stdout: string): SdkListResult {
  const result: SdkListResult = { installed: [], available: [] };
  let section: 'installed' | 'available' | null = null;
  for (const rawLine of stdout.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (/^Installed packages:/i.test(line)) section = 'installed';
    else if (/^Available Packages:/i.test(line)) section = 'available';
    else if (/^Available Updates:/i.test(line)) section = null;
    else if (section && line.includes('|')) {
      const cells = line.split('|').map((cell) => cell.trim());
      if (cells[0] === 'Path' || cells[0] === 'ID' || /^-+$/.test(cells[0]) || !cells[0]) continue;
      result[section].push({ path: cells[0], version: cells[1] ?? '', description: cells[2] ?? '', location: cells[3] || undefined });
    }
  }
  return result;
}

/** Downloadable system images for this host, newest first, excluding installed ones. */
export function availableSystemImages(list: SdkListResult, hostAbi: HostAbi, installedIds: ReadonlySet<string>): SystemImage[] {
  const abis = abisForHost(hostAbi);
  const seen = new Set<string>();
  const images: SystemImage[] = [];
  for (const row of list.available) {
    if (!row.path.startsWith('system-images;') || installedIds.has(row.path) || seen.has(row.path)) continue;
    const image = systemImageFromId(row.path, { description: row.description, revision: row.version });
    if (!image || !abis.includes(image.abi)) continue;
    seen.add(row.path);
    images.push(image);
  }
  return images.sort(compareSystemImages);
}

// ---------- sdkmanager --install output ----------

/** Last "[====   ] 42% Downloading x.zip..." in a chunk of sdkmanager output. */
export function parseSdkmanagerProgress(chunk: string): { percent: number; message: string } | null {
  let last: { percent: number; message: string } | null = null;
  for (const segment of chunk.split(/[\r\n]+/)) {
    const match = /\[[=\s]*\]\s*(\d{1,3})%\s*(.*?)\s*$/.exec(segment);
    if (match) last = { percent: Math.min(100, Number(match[1])), message: match[2].replace(/\.{3}$/, '…') };
  }
  return last;
}

export type SdkInstallEvent =
  | { type: 'progress'; percent: number; message: string }
  | { type: 'license'; id: string; text: string };

/**
 * Follows `sdkmanager --install` output. License prompts look like
 *
 *   License android-sdk-license:
 *   ---------------------------------------
 *   <text>
 *   ---------------------------------------
 *   Accept? (y/N):
 *
 * and repeat for each license that isn't accepted yet. The prompt has no
 * trailing newline, so text is buffered until "Accept? (y/N):" arrives.
 */
export class SdkInstallOutputParser {
  private buffer = '';

  feed(chunk: string): SdkInstallEvent[] {
    this.buffer += chunk;
    const events: SdkInstallEvent[] = [];
    for (;;) {
      const licenseStart = this.buffer.search(/License [^\s:]+:\s*\r?\n/);
      const promptIndex = this.buffer.indexOf('Accept? (y/N):');
      if (licenseStart >= 0 && promptIndex > licenseStart) {
        const before = this.buffer.slice(0, licenseStart);
        const progress = parseSdkmanagerProgress(before);
        if (progress) events.push({ type: 'progress', ...progress });
        const block = this.buffer.slice(licenseStart, promptIndex);
        const id = /^License ([^\s:]+):/.exec(block)?.[1] ?? 'license';
        const text = block
          .replace(/^License [^\s:]+:\s*\r?\n/, '')
          .replace(/^-{5,}\s*\r?\n/, '')
          .replace(/\r?\n-{5,}\s*$/, '')
          .replace(/\r\n/g, '\n')
          .trim();
        events.push({ type: 'license', id, text });
        this.buffer = this.buffer.slice(promptIndex + 'Accept? (y/N):'.length);
        continue;
      }
      if (licenseStart >= 0) {
        // Wait for the rest of the license; report progress printed before it.
        const progress = parseSdkmanagerProgress(this.buffer.slice(0, licenseStart));
        if (progress) events.push({ type: 'progress', ...progress });
        this.buffer = this.buffer.slice(licenseStart);
        break;
      }
      const progress = parseSdkmanagerProgress(this.buffer);
      if (progress) events.push({ type: 'progress', ...progress });
      // Keep only the unfinished tail (a license header may be split across chunks).
      const lastBreak = Math.max(this.buffer.lastIndexOf('\n'), this.buffer.lastIndexOf('\r'));
      this.buffer = lastBreak >= 0 ? this.buffer.slice(lastBreak + 1) : this.buffer;
      break;
    }
    return events;
  }
}

/** The reason an install failed, from sdkmanager's output. */
export function sdkmanagerFailure(output: string): string | null {
  const lines = output.split(/[\r\n]+/).map((line) => line.trim());
  if (lines.some((line) => /^Skipping following packages as the license is not accepted/i.test(line))) {
    return 'The license was not accepted, so nothing was downloaded.';
  }
  const error = lines.find((line) => /^(Error|Warning): (Failed|Package|.*not found|.*could not)/i.test(line) || /^Exception/.test(line));
  return error ? error.replace(/^(Error|Warning):\s*/, '') : null;
}

// ---------- command lines ----------

export function buildEmulatorArgs(name: string, options: StartAvdOptions = {}): string[] {
  if (!isValidAvdName(name)) throw new Error(`"${name}" is not a valid emulator name`);
  const args = ['-avd', name];
  if (options.wipeData) args.push('-wipe-data');
  // -wipe-data implies a cold boot; -no-snapshot-load keeps saving on exit.
  else if (options.coldBoot) args.push('-no-snapshot-load');
  if (options.headless) args.push('-no-window');
  if (options.noAudio) args.push('-no-audio');
  return args;
}

export function buildCreateAvdArgs(request: CreateAvdRequest): string[] {
  if (!isValidAvdName(request.name)) throw new Error(`"${request.name}" is not a valid emulator name`);
  if (!isValidSystemImageId(request.systemImage)) throw new Error('Choose an installed system image');
  if (!request.device || /[\r\n"]/.test(request.device)) throw new Error('Choose a device profile');
  const args = ['create', 'avd', '--name', request.name, '--package', request.systemImage, '--device', request.device];
  if (request.sdCardMb && request.sdCardMb > 0) args.push('--sdcard', `${Math.round(request.sdCardMb)}M`);
  return args;
}

/** config.ini keys written after avdmanager creates the AVD. */
export function createConfigPatch(request: CreateAvdRequest): Record<string, string> {
  const patch: Record<string, string> = { 'hw.keyboard': 'yes' };
  if (request.displayName?.trim()) patch['avd.ini.displayname'] = request.displayName.trim().replace(/[\r\n]/g, ' ');
  if (request.ramMb && request.ramMb >= 512) patch['hw.ramSize'] = String(Math.round(request.ramMb));
  if (request.storageGb && request.storageGb >= 1) patch['disk.dataPartition.size'] = String(Math.round(request.storageGb * 1024 ** 3));
  return patch;
}

// ---------- adb ----------

export function isEmulatorSerial(serial: string): boolean {
  return /^emulator-\d+$/.test(serial);
}

export function parseAdbDevices(stdout: string): { serial: string; status: string }[] {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[0])
    .map(([serial, status]) => ({ serial, status }));
}

/** `adb -s emulator-5554 emu avd name` prints the name, then "OK". */
export function parseEmuAvdName(stdout: string): string | null {
  const line = stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value && value !== 'OK');
  if (!line || /^KO\b/.test(line) || !isValidAvdName(line)) return null;
  return line;
}

/** Error lines from an emulator log, for failed launches. */
export function extractEmulatorErrors(log: string): string[] {
  const errors: string[] = [];
  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    const tagged = /^(ERROR|FATAL|PANIC)\s*\|\s*(.+)$/.exec(line);
    if (tagged) errors.push(tagged[2].trim());
    else if (/^(PANIC|ERROR|FATAL):\s*/.test(line)) errors.push(line.replace(/^(PANIC|ERROR|FATAL):\s*/, ''));
  }
  return errors.filter(Boolean);
}

/** A warning worth showing while an emulator boots, from its log. */
export function emulatorBootWarning(log: string): string | null {
  if (/hvf is not enabled|HVF.*(unavailable|not available)|requires hardware acceleration|KVM (is|requires)|HAXM is not installed|WHPX.*not/i.test(log)) {
    return 'Hardware acceleration is not available, so Android runs in software and can take many minutes to boot.';
  }
  return null;
}

// ---------- SDK & tool discovery ----------

export interface SdkCandidate {
  path: string;
  source: 'ANDROID_HOME' | 'ANDROID_SDK_ROOT' | 'default';
}

export function sdkCandidates(
  env: Record<string, string | undefined>,
  home: string,
  platform: string,
  join: (...parts: string[]) => string
): SdkCandidate[] {
  const candidates: SdkCandidate[] = [];
  if (env.ANDROID_HOME) candidates.push({ path: env.ANDROID_HOME, source: 'ANDROID_HOME' });
  if (env.ANDROID_SDK_ROOT) candidates.push({ path: env.ANDROID_SDK_ROOT, source: 'ANDROID_SDK_ROOT' });
  if (platform === 'darwin') candidates.push({ path: join(home, 'Library', 'Android', 'sdk'), source: 'default' });
  else if (platform === 'win32') {
    const local = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    candidates.push({ path: join(local, 'Android', 'Sdk'), source: 'default' });
  } else {
    candidates.push({ path: join(home, 'Android', 'Sdk'), source: 'default' });
    candidates.push({ path: join(home, 'Android', 'sdk'), source: 'default' });
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => !seen.has(candidate.path) && !!seen.add(candidate.path));
}

/** cmdline-tools/<dir> folders in preference order: latest, then newest version. */
export function orderCmdlineToolsDirs(dirs: readonly string[]): string[] {
  const version = (dir: string) => dir.split(/[.-]/).map((part) => Number(part) || 0);
  return [...dirs]
    .filter((dir) => !dir.startsWith('.'))
    .sort((a, b) => {
      if (a === 'latest') return -1;
      if (b === 'latest') return 1;
      const va = version(a);
      const vb = version(b);
      for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
        const diff = (vb[i] ?? 0) - (va[i] ?? 0);
        if (diff) return diff;
      }
      return a.localeCompare(b);
    });
}

export function javaMajorVersion(version: string | null | undefined): number | null {
  if (!version) return null;
  const match = /^(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match) return null;
  const first = Number(match[1]);
  // "1.8.0_292" is Java 8.
  return first === 1 && match[2] ? Number(match[2]) : first;
}

/** `java -version` (stderr) → "21.0.8". */
export function parseJavaVersionOutput(output: string): string | null {
  return /(?:java|openjdk) version "([^"]+)"/i.exec(output)?.[1] ?? /(?:java|openjdk) (\d+[\w.+-]*)/i.exec(output)?.[1] ?? null;
}

/** A JDK's `release` file → JAVA_VERSION. */
export function parseJavaReleaseFile(text: string): string | null {
  return /^JAVA_VERSION="?([^"\r\n]+)"?/m.exec(text)?.[1] ?? null;
}

/** Oldest Java the current cmdline-tools run on. */
export const MIN_JAVA_MAJOR = 17;

/**
 * Windows can't spawn .bat files directly (CVE-2024-27980); run them through
 * cmd.exe with every argument quoted. Arguments with characters cmd.exe would
 * interpret are refused rather than escaped.
 */
export function windowsBatchInvocation(script: string, args: readonly string[]): { command: string; args: string[] } {
  for (const value of [script, ...args]) {
    if (/["%^&|<>!\r\n]/.test(value)) throw new Error(`Unsupported character in "${value}"`);
  }
  const line = [script, ...args].map((value) => `"${value}"`).join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`] };
}

// ---------- formatting ----------

export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}
