/**
 * Types shared by the emulator (AVD) manager in main, the preload bridge and
 * the renderer. No imports on purpose: the renderer's tsconfig includes it.
 */

export type HostAbi = 'arm64-v8a' | 'x86_64';

export type EmulatorSetupIssueId = 'sdk' | 'emulator' | 'cmdline-tools' | 'java' | 'system-images';

export interface EmulatorSetupIssue {
  id: EmulatorSetupIssueId;
  title: string;
  detail: string;
  /** `blocking`: nothing in the manager works; `limited`: some actions are unavailable. */
  severity: 'blocking' | 'limited';
}

export interface JavaRuntime {
  /** The java executable. */
  path: string;
  /** JAVA_HOME to hand to avdmanager/sdkmanager. */
  home: string | null;
  version: string | null;
  major: number | null;
  source: 'JAVA_HOME' | 'android-studio' | 'java_home' | 'path';
}

export interface EmulatorSetup {
  sdkPath: string | null;
  sdkSource: 'ANDROID_HOME' | 'ANDROID_SDK_ROOT' | 'default' | null;
  /** Folders that were checked for an SDK, for the setup screen. */
  searchedSdkPaths: string[];
  avdHome: string;
  emulatorPath: string | null;
  avdmanagerPath: string | null;
  sdkmanagerPath: string | null;
  java: JavaRuntime | null;
  hostAbi: HostAbi;
  issues: EmulatorSetupIssue[];
  /** AVDs can be listed (always true: listing only reads files). */
  canList: boolean;
  /** Emulators can be started and stopped. */
  canStart: boolean;
  /** AVDs can be created, renamed (avdmanager + Java). */
  canCreate: boolean;
  /** System images can be listed and downloaded (sdkmanager + Java). */
  canDownload: boolean;
}

export type AvdRunState = 'stopped' | 'starting' | 'booting' | 'running' | 'stopping';

export type BootPhase = 'launching' | 'waiting-for-device' | 'booting' | 'ready' | 'failed';

export interface BootProgress {
  name: string;
  phase: BootPhase;
  startedAt: number;
  /** Set once the emulator shows up in adb. */
  serial: string | null;
  message: string;
  error?: string;
  /** Something that makes this boot slow, e.g. no hardware acceleration. */
  warning?: string;
  /** Started with -wipe-data, -no-window etc. */
  options: StartAvdOptions;
}

export interface StartAvdOptions {
  coldBoot?: boolean;
  wipeData?: boolean;
  headless?: boolean;
  noAudio?: boolean;
}

export interface AvdInfo {
  /** AVD id: the file name of <name>.ini, what `emulator -avd` takes. */
  name: string;
  displayName: string;
  /** Device profile id, e.g. pixel_6. */
  deviceProfile: string | null;
  deviceManufacturer: string | null;
  /** "36", "36.1", "35-ext14" … as the system image names it. */
  apiLevel: string | null;
  /** Marketing version, e.g. "16". */
  androidVersion: string | null;
  abi: string | null;
  tagId: string | null;
  tagDisplay: string | null;
  playStore: boolean;
  /** sdkmanager package id of the system image, e.g. system-images;android-36;google_apis;arm64-v8a. */
  systemImage: string | null;
  systemImageInstalled: boolean;
  ramMb: number | null;
  storageBytes: number | null;
  sdCard: string | null;
  screen: { width: number; height: number; density: number | null } | null;
  path: string;
  sizeOnDiskBytes: number | null;
  snapshots: string[];
  state: AvdRunState;
  /** adb serial (emulator-5554) while it runs. */
  serial: string | null;
  boot: BootProgress | null;
  /** Config problems, e.g. a missing system image. */
  problem: string | null;
}

export interface AvdListResult {
  setup: EmulatorSetup;
  avds: AvdInfo[];
}

export type DeviceProfileCategory = 'phone' | 'tablet' | 'wear' | 'tv' | 'automotive' | 'desktop' | 'xr' | 'other';

export interface DeviceProfile {
  id: string;
  name: string;
  oem: string | null;
  tag: string | null;
  category: DeviceProfileCategory;
}

export interface SystemImage {
  /** sdkmanager package id. */
  id: string;
  /** Folder name under system-images, e.g. android-36 or android-35-ext14. */
  platform: string;
  apiLevel: string;
  androidVersion: string | null;
  tagId: string;
  tagDisplay: string;
  abi: string;
  description: string;
  revision: string | null;
  installed: boolean;
  path: string | null;
  playStore: boolean;
}

export interface AvailableImagesResult {
  images: SystemImage[];
  fetchedAt: number;
}

export interface CreateAvdRequest {
  name: string;
  systemImage: string;
  device: string;
  displayName?: string;
  ramMb?: number;
  storageGb?: number;
  /** 0 or undefined: no SD card. */
  sdCardMb?: number;
}

export type ImageInstallPhase = 'preparing' | 'license' | 'downloading' | 'installing' | 'done' | 'failed' | 'cancelled';

export interface ImageInstallJob {
  id: string;
  packageId: string;
  phase: ImageInstallPhase;
  percent: number | null;
  message: string;
  /** Set while waiting for the user to accept or decline a license. */
  license: { id: string; text: string } | null;
  error?: string;
  startedAt: number;
}
