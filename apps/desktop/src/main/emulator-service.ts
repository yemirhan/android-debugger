/**
 * Android emulator (AVD) manager: finds the SDK and its tools, lists AVDs by
 * reading ~/.android/avd directly (no Java needed), starts emulators detached
 * so they outlive the app, tracks boot progress over adb, and wraps
 * avdmanager/sdkmanager for creating AVDs and installing system images.
 *
 * Every adb call here targets an emulator serial (emulator-<port>); nothing
 * is ever sent to physical devices. Tool processes (avdmanager, sdkmanager)
 * are killed on quit; emulators keep running.
 */
import { execFile, spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  AvailableImagesResult,
  AvdInfo,
  AvdListResult,
  BootProgress,
  CreateAvdRequest,
  DeviceProfile,
  EmulatorSetup,
  EmulatorSetupIssue,
  ImageInstallJob,
  JavaRuntime,
  StartAvdOptions,
  SystemImage,
} from './emulator-types';
import {
  MIN_JAVA_MAJOR,
  SdkInstallOutputParser,
  availableSystemImages,
  avdHomeFor,
  buildCreateAvdArgs,
  buildEmulatorArgs,
  compareSystemImages,
  createConfigPatch,
  describeAvd,
  extractEmulatorErrors,
  emulatorBootWarning,
  hostAbiFor,
  isEmulatorSerial,
  isValidAvdName,
  isValidSystemImageId,
  javaMajorVersion,
  orderCmdlineToolsDirs,
  parseAdbDevices,
  parseDeviceProfiles,
  parseEmuAvdName,
  parseIni,
  parseJavaReleaseFile,
  parseJavaVersionOutput,
  parseListAvds,
  parseLockPid,
  parseSdkmanagerList,
  parseSystemImageId,
  sdkCandidates,
  sdkmanagerFailure,
  sortDeviceProfiles,
  systemImageFromSourceProperties,
  updateIniText,
  validateAvdName,
  windowsBatchInvocation,
  wipeTargets,
} from './emulator-parsers';

const IS_WINDOWS = process.platform === 'win32';
const SETUP_CACHE_MS = 30_000;
const LIST_AVDS_CACHE_MS = 30_000;
const SIZE_CACHE_MS = 15_000;
const PID_CHECK_CACHE_MS = 10_000;
const AVAILABLE_CACHE_MS = 15 * 60_000;
const BOOT_POLL_MS = 1_500;
const BOOT_TIMEOUT_MS = 6 * 60_000;
/** A launch that never reaches adb within this long is reported as waiting. */
const WAITING_AFTER_MS = 20_000;
const STOP_WAIT_MS = 15_000;
const CREATE_TIMEOUT_MS = 3 * 60_000;
const LIST_TIMEOUT_MS = 3 * 60_000;
/** An install with no output for this long (and no open license prompt) is stuck. */
const INSTALL_IDLE_TIMEOUT_MS = 10 * 60_000;
/** Finished boots and installs stay visible this long. */
const FINISHED_RETENTION_MS = 60_000;

export class EmulatorError extends Error {}

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function exec(file: string, args: readonly string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(file, [...args], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? ((error as { code: number }).code) : null) : 0;
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code });
    });
  });
}

/** Only ever address emulators; never a physical device. */
function adbEmulator(serial: string, args: readonly string[], timeoutMs: number): Promise<ExecResult> {
  if (!isEmulatorSerial(serial)) throw new EmulatorError(`Refusing to address ${serial}: not an emulator`);
  return exec('adb', ['-s', serial, ...args], timeoutMs);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function readDir(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Allocated size (sparse qcow2/img files report huge logical sizes). */
async function diskUsage(target: string, depth = 0): Promise<number> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(target);
  } catch {
    return 0;
  }
  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return IS_WINDOWS || !stat.blocks ? stat.size : Math.min(stat.size, stat.blocks * 512);
  if (depth > 6) return 0;
  const entries = await readDir(target);
  const sizes = await Promise.all(entries.map((entry) => diskUsage(path.join(target, entry.name), depth + 1)));
  return sizes.reduce((sum, size) => sum + size, 0);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (IS_WINDOWS) {
    // cmd.exe → java: kill the whole tree.
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    return;
  }
  try {
    child.kill(signal);
  } catch {
    // Already gone
  }
}

interface BootTracker {
  progress: BootProgress;
  polls: number;
  child: ChildProcess | null;
  exitCode: number | null | undefined;
  logPath: string;
  timer: NodeJS.Timeout | null;
  finishedAt: number | null;
}

interface InstallJobInternal {
  job: ImageInstallJob;
  child: ChildProcess | null;
  output: string;
  idleTimer: NodeJS.Timeout | null;
  declined: boolean;
  cancelled: boolean;
  finishedAt: number | null;
}

interface RunningEmulator {
  serial: string;
  status: string;
  booted: boolean;
}

interface AvdEntry {
  name: string;
  iniPath: string;
  avdPath: string;
  topIni: Record<string, string>;
  config: Record<string, string> | null;
}

export class EmulatorService extends EventEmitter {
  private logDir = path.join(os.tmpdir(), 'android-debugger-emulator-logs');
  private setupCache: { value: EmulatorSetup; at: number } | null = null;
  private setupInFlight: Promise<EmulatorSetup> | null = null;
  private tools = new Set<ChildProcess>();
  private boots = new Map<string, BootTracker>();
  private stopping = new Set<string>();
  private serialNames = new Map<string, string>();
  private bootedSerials = new Set<string>();
  private listAvdsCache: { names: string[]; at: number } | null = null;
  private sizeCache = new Map<string, { bytes: number; at: number }>();
  private emulatorPidCache = new Map<number, { value: boolean; at: number }>();
  private profilesCache: DeviceProfile[] | null = null;
  private availableCache: AvailableImagesResult | null = null;
  private jobs = new Map<string, InstallJobInternal>();
  private disposed = false;

  setLogDir(dir: string): void {
    this.logDir = dir;
  }

  // ---------- setup ----------

  async getSetup(force = false): Promise<EmulatorSetup> {
    if (!force && this.setupCache && Date.now() - this.setupCache.at < SETUP_CACHE_MS) return this.setupCache.value;
    if (this.setupInFlight) return this.setupInFlight;
    this.setupInFlight = this.detectSetup()
      .then((value) => {
        this.setupCache = { value, at: Date.now() };
        return value;
      })
      .finally(() => {
        this.setupInFlight = null;
      });
    return this.setupInFlight;
  }

  private async detectSetup(): Promise<EmulatorSetup> {
    const home = os.homedir();
    const candidates = sdkCandidates(process.env, home, process.platform, path.join);
    let sdk: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (await this.isSdkDir(candidate.path)) {
        sdk = candidate;
        break;
      }
    }
    const exe = IS_WINDOWS ? '.exe' : '';
    const bat = IS_WINDOWS ? '.bat' : '';
    let emulatorPath: string | null = null;
    let avdmanagerPath: string | null = null;
    let sdkmanagerPath: string | null = null;
    if (sdk) {
      for (const candidate of [path.join(sdk.path, 'emulator', `emulator${exe}`), path.join(sdk.path, 'tools', `emulator${exe}`)]) {
        if (await exists(candidate)) {
          emulatorPath = candidate;
          break;
        }
      }
      const toolDirs = orderCmdlineToolsDirs(
        (await readDir(path.join(sdk.path, 'cmdline-tools'))).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
      ).map((dir) => path.join(sdk!.path, 'cmdline-tools', dir, 'bin'));
      toolDirs.push(path.join(sdk.path, 'tools', 'bin'));
      for (const dir of toolDirs) {
        const avdmanager = path.join(dir, `avdmanager${bat}`);
        const sdkmanager = path.join(dir, `sdkmanager${bat}`);
        if (!avdmanagerPath && (await exists(avdmanager))) avdmanagerPath = avdmanager;
        if (!sdkmanagerPath && (await exists(sdkmanager))) sdkmanagerPath = sdkmanager;
        if (avdmanagerPath && sdkmanagerPath) break;
      }
    }
    const java = await this.findJava().catch(() => null);
    const javaOk = !!java && (java.major === null || java.major >= MIN_JAVA_MAJOR);

    const issues: EmulatorSetupIssue[] = [];
    if (!sdk) {
      issues.push({
        id: 'sdk',
        title: 'Android SDK not found',
        detail:
          'Install Android Studio and open it once so it downloads the SDK, or set ANDROID_HOME to your SDK folder and restart Android Debugger.',
        severity: 'blocking',
      });
    } else {
      if (!emulatorPath) {
        issues.push({
          id: 'emulator',
          title: 'Android Emulator is not installed',
          detail: 'In Android Studio, open Settings › Languages & Frameworks › Android SDK › SDK Tools and install “Android Emulator”.',
          severity: 'limited',
        });
      }
      if (!avdmanagerPath || !sdkmanagerPath) {
        issues.push({
          id: 'cmdline-tools',
          title: 'Command-line tools are missing',
          detail:
            'Creating emulators and downloading system images need “Android SDK Command-line Tools (latest)”, from the same SDK Tools tab.',
          severity: 'limited',
        });
      } else if (!java) {
        issues.push({
          id: 'java',
          title: 'Java is not installed',
          detail: `avdmanager and sdkmanager need Java ${MIN_JAVA_MAJOR} or newer. Android Studio includes one; otherwise install a JDK or set JAVA_HOME.`,
          severity: 'limited',
        });
      } else if (!javaOk) {
        issues.push({
          id: 'java',
          title: `Java ${java.version ?? java.major} is too old`,
          detail: `avdmanager and sdkmanager need Java ${MIN_JAVA_MAJOR} or newer (found at ${java.path}). Install a newer JDK or point JAVA_HOME at one.`,
          severity: 'limited',
        });
      }
    }
    return {
      sdkPath: sdk?.path ?? null,
      sdkSource: sdk?.source ?? null,
      searchedSdkPaths: candidates.map((candidate) => candidate.path),
      avdHome: avdHomeFor(process.env, home, path.join),
      emulatorPath,
      avdmanagerPath,
      sdkmanagerPath,
      java,
      hostAbi: hostAbiFor(process.arch),
      issues,
      canList: true,
      canStart: !!emulatorPath,
      canCreate: !!avdmanagerPath && javaOk,
      canDownload: !!sdkmanagerPath && javaOk,
    };
  }

  private async isSdkDir(dir: string): Promise<boolean> {
    if (!(await exists(dir))) return false;
    for (const marker of ['emulator', 'platform-tools', 'system-images', 'cmdline-tools', 'platforms']) {
      if (await exists(path.join(dir, marker))) return true;
    }
    return false;
  }

  private async findJava(): Promise<JavaRuntime | null> {
    const exe = IS_WINDOWS ? 'java.exe' : 'java';
    const home = os.homedir();
    const homes: { home: string; source: JavaRuntime['source'] }[] = [];
    if (process.env.JAVA_HOME) homes.push({ home: process.env.JAVA_HOME, source: 'JAVA_HOME' });
    if (process.platform === 'darwin') {
      for (const root of ['/Applications', path.join(home, 'Applications')]) {
        for (const appName of ['Android Studio.app', 'Android Studio Preview.app']) {
          homes.push({ home: path.join(root, appName, 'Contents', 'jbr', 'Contents', 'Home'), source: 'android-studio' });
          homes.push({ home: path.join(root, appName, 'Contents', 'jre', 'Contents', 'Home'), source: 'android-studio' });
        }
      }
    } else if (IS_WINDOWS) {
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      homes.push({ home: path.join(programFiles, 'Android', 'Android Studio', 'jbr'), source: 'android-studio' });
      if (process.env.LOCALAPPDATA) {
        homes.push({ home: path.join(process.env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr'), source: 'android-studio' });
      }
    } else {
      for (const root of ['/opt/android-studio', path.join(home, 'android-studio'), '/usr/local/android-studio', '/snap/android-studio/current']) {
        homes.push({ home: path.join(root, 'jbr'), source: 'android-studio' });
      }
    }

    const found: JavaRuntime[] = [];
    for (const candidate of homes) {
      const javaPath = path.join(candidate.home, 'bin', exe);
      if (!(await exists(javaPath))) continue;
      const release = await readText(path.join(candidate.home, 'release'));
      const version = (release && parseJavaReleaseFile(release)) || (await this.javaVersion(javaPath));
      found.push({ path: javaPath, home: candidate.home, version, major: javaMajorVersion(version), source: candidate.source });
      if (found.at(-1)!.major === null || found.at(-1)!.major! >= MIN_JAVA_MAJOR) return found.at(-1)!;
    }

    if (process.platform === 'darwin' && (await exists('/usr/libexec/java_home'))) {
      const result = await exec('/usr/libexec/java_home', [], 5_000);
      const javaHome = result.code === 0 ? result.stdout.trim() : '';
      if (javaHome && (await exists(path.join(javaHome, 'bin', 'java')))) {
        const release = await readText(path.join(javaHome, 'release'));
        const version = (release && parseJavaReleaseFile(release)) || (await this.javaVersion(path.join(javaHome, 'bin', 'java')));
        const runtime: JavaRuntime = { path: path.join(javaHome, 'bin', 'java'), home: javaHome, version, major: javaMajorVersion(version), source: 'java_home' };
        if (runtime.major === null || runtime.major >= MIN_JAVA_MAJOR) return runtime;
        found.push(runtime);
      }
    }

    // `java` on PATH. On macOS /usr/bin/java is a stub that fails without a JDK.
    const version = await this.javaVersion('java');
    if (version) {
      const runtime: JavaRuntime = { path: 'java', home: null, version, major: javaMajorVersion(version), source: 'path' };
      if (runtime.major === null || runtime.major >= MIN_JAVA_MAJOR) return runtime;
      found.push(runtime);
    }
    return found[0] ?? null;
  }

  private async javaVersion(javaPath: string): Promise<string | null> {
    const result = await exec(javaPath, ['-version'], 10_000);
    return parseJavaVersionOutput(`${result.stderr}\n${result.stdout}`);
  }

  // ---------- tools ----------

  private toolEnv(setup: EmulatorSetup): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (setup.sdkPath) {
      env.ANDROID_HOME = setup.sdkPath;
      env.ANDROID_SDK_ROOT = setup.sdkPath;
    }
    if (setup.java?.home) env.JAVA_HOME = setup.java.home;
    // Electron sets this for its helper processes; it must not leak into tools.
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }

  private spawnTool(tool: string, args: readonly string[], setup: EmulatorSetup): ChildProcess {
    const invocation = IS_WINDOWS && tool.toLowerCase().endsWith('.bat') ? windowsBatchInvocation(tool, args) : { command: tool, args: [...args] };
    const child = spawn(invocation.command, invocation.args, {
      env: this.toolEnv(setup),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: IS_WINDOWS && invocation.command === 'cmd.exe',
    });
    this.tools.add(child);
    child.once('close', () => this.tools.delete(child));
    child.once('error', () => this.tools.delete(child));
    return child;
  }

  /** Runs avdmanager/sdkmanager to completion. */
  private runTool(tool: string, args: readonly string[], setup: EmulatorSetup, options: { timeoutMs: number; input?: string }): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(new EmulatorError('Android Debugger is quitting'));
        return;
      }
      let child: ChildProcess;
      try {
        child = this.spawnTool(tool, args, setup);
      } catch (error) {
        reject(error);
        return;
      }
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
        setTimeout(() => killTree(child, 'SIGKILL'), 2_000).unref();
      }, options.timeoutMs);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (timedOut) reject(new EmulatorError(`${path.basename(tool)} did not finish in ${Math.round(options.timeoutMs / 1000)} s`));
        else resolve({ stdout, stderr, code });
      });
      child.stdin?.on('error', () => {});
      if (options.input !== undefined) child.stdin?.end(options.input);
      else child.stdin?.end();
    });
  }

  private toolError(result: ExecResult, fallback: string): string {
    const lines = `${result.stderr}\n${result.stdout}`
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const error = lines.find((line) => /^Error:/i.test(line)) ?? lines.find((line) => /error|exception|failed/i.test(line));
    return error ? error.replace(/^Error:\s*/i, '') : `${fallback} (exit code ${result.code ?? 'unknown'})`;
  }

  // ---------- AVDs ----------

  private async readAvdEntries(avdHome: string): Promise<AvdEntry[]> {
    const entries = await readDir(avdHome);
    const avds = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ini'))
        .map(async (entry): Promise<AvdEntry | null> => {
          const name = entry.name.slice(0, -4);
          if (!isValidAvdName(name)) return null;
          const iniPath = path.join(avdHome, entry.name);
          const topIni = parseIni((await readText(iniPath)) ?? '');
          let avdPath = topIni.path && (await exists(topIni.path)) ? topIni.path : path.join(avdHome, `${name}.avd`);
          if (!(await exists(avdPath)) && topIni['path.rel']) {
            const relative = path.join(path.dirname(avdHome), topIni['path.rel']);
            if (await exists(relative)) avdPath = relative;
          }
          const configText = await readText(path.join(avdPath, 'config.ini'));
          return { name, iniPath, avdPath, topIni, config: configText === null ? null : parseIni(configText) };
        })
    );
    return avds.filter((avd): avd is AvdEntry => avd !== null);
  }

  private async findEntry(name: string): Promise<{ setup: EmulatorSetup; entry: AvdEntry }> {
    if (!isValidAvdName(name)) throw new EmulatorError(`"${name}" is not a valid emulator name`);
    const setup = await this.getSetup();
    const entry = (await this.readAvdEntries(setup.avdHome)).find((candidate) => candidate.name === name);
    if (!entry) throw new EmulatorError(`No emulator named "${name}". Emulators live in ${setup.avdHome}.`);
    return { setup, entry };
  }

  async listSystemImages(setup?: EmulatorSetup): Promise<SystemImage[]> {
    const resolved = setup ?? (await this.getSetup());
    if (!resolved.sdkPath) return [];
    const root = path.join(resolved.sdkPath, 'system-images');
    const images: SystemImage[] = [];
    for (const platform of await readDir(root)) {
      if (!platform.isDirectory()) continue;
      for (const tag of await readDir(path.join(root, platform.name))) {
        if (!tag.isDirectory()) continue;
        for (const abi of await readDir(path.join(root, platform.name, tag.name))) {
          if (!abi.isDirectory()) continue;
          const imagePath = path.join(root, platform.name, tag.name, abi.name);
          const text = await readText(path.join(imagePath, 'source.properties'));
          if (text === null) continue;
          const image = systemImageFromSourceProperties(platform.name, parseIni(text), imagePath);
          if (image) images.push(image);
        }
      }
    }
    return images.sort(compareSystemImages);
  }

  private async listAvdNamesFromEmulator(setup: EmulatorSetup): Promise<string[]> {
    if (!setup.emulatorPath) return [];
    if (this.listAvdsCache && Date.now() - this.listAvdsCache.at < LIST_AVDS_CACHE_MS) return this.listAvdsCache.names;
    const result = await exec(setup.emulatorPath, ['-list-avds'], 15_000);
    const names = result.code === 0 ? parseListAvds(result.stdout) : [];
    this.listAvdsCache = { names, at: Date.now() };
    return names;
  }

  /** Emulators adb can see, keyed by AVD name. */
  private async runningEmulators(): Promise<Map<string, RunningEmulator>> {
    const result = await exec('adb', ['devices'], 10_000);
    const emulators = result.code === 0 ? parseAdbDevices(result.stdout).filter((entry) => isEmulatorSerial(entry.serial)) : [];
    const present = new Set(emulators.map((entry) => entry.serial));
    for (const serial of [...this.serialNames.keys()]) if (!present.has(serial)) this.serialNames.delete(serial);
    for (const serial of [...this.bootedSerials]) if (!present.has(serial)) this.bootedSerials.delete(serial);

    const running = new Map<string, RunningEmulator>();
    await Promise.all(
      emulators.map(async ({ serial, status }) => {
        let name = this.serialNames.get(serial) ?? null;
        if (!name) {
          name = parseEmuAvdName((await adbEmulator(serial, ['emu', 'avd', 'name'], 5_000)).stdout);
          if (!name && status === 'device') {
            const prop = await adbEmulator(serial, ['shell', 'getprop', 'ro.boot.qemu.avd_name'], 5_000);
            name = prop.stdout.trim() || null;
            if (!name) name = (await adbEmulator(serial, ['shell', 'getprop', 'ro.kernel.qemu.avd_name'], 5_000)).stdout.trim() || null;
          }
          if (name && isValidAvdName(name)) this.serialNames.set(serial, name);
          else name = null;
        }
        let booted = this.bootedSerials.has(serial);
        if (!booted && status === 'device') {
          booted = (await adbEmulator(serial, ['shell', 'getprop', 'sys.boot_completed'], 5_000)).stdout.trim() === '1';
          if (booted) this.bootedSerials.add(serial);
        }
        if (name) running.set(name, { serial, status, booted: booted && status === 'device' });
      })
    );
    return running;
  }

  /** PID from the emulator's lock file, when that process is alive and is an emulator. */
  private async lockedPid(avdPath: string): Promise<number | null> {
    const lock = path.join(avdPath, 'hardware-qemu.ini.lock');
    let text: string | null = null;
    try {
      const stat = await fs.promises.stat(lock);
      text = stat.isDirectory() ? await readText(path.join(lock, 'pid')) : await readText(lock);
    } catch {
      return null;
    }
    const pid = text ? parseLockPid(text) : null;
    if (!pid || !pidAlive(pid)) return null;
    return (await this.isEmulatorProcess(pid)) ? pid : null;
  }

  /** Guards against stale lock files whose PID now belongs to another program. */
  private async isEmulatorProcess(pid: number, fresh = false): Promise<boolean> {
    const cached = this.emulatorPidCache.get(pid);
    if (!fresh && cached && Date.now() - cached.at < PID_CHECK_CACHE_MS) return cached.value;
    let value = true;
    if (!IS_WINDOWS) {
      const ps = await exec('ps', ['-p', String(pid), '-o', 'comm='], 5_000);
      value = ps.code === 0 && /qemu|emulator/i.test(ps.stdout);
    }
    this.emulatorPidCache.set(pid, { value, at: Date.now() });
    if (this.emulatorPidCache.size > 64) this.emulatorPidCache.delete(this.emulatorPidCache.keys().next().value!);
    return value;
  }

  private async sizeOf(avdPath: string): Promise<number> {
    const cached = this.sizeCache.get(avdPath);
    if (cached && Date.now() - cached.at < SIZE_CACHE_MS) return cached.bytes;
    const bytes = await diskUsage(avdPath);
    this.sizeCache.set(avdPath, { bytes, at: Date.now() });
    return bytes;
  }

  async listAvds(): Promise<AvdListResult> {
    const setup = await this.getSetup();
    const [entries, running, images, emulatorNames] = await Promise.all([
      this.readAvdEntries(setup.avdHome),
      this.runningEmulators().catch(() => new Map<string, RunningEmulator>()),
      this.listSystemImages(setup),
      this.listAvdNamesFromEmulator(setup).catch(() => []),
    ]);
    const imagesById = new Map(images.map((image) => [image.id, image]));
    this.pruneBoots();

    const avds = await Promise.all(
      entries.map(async (entry): Promise<AvdInfo> => {
        const config = entry.config ?? {};
        const base = describeAvd({ name: entry.name, topIni: entry.topIni, config, path: entry.avdPath, image: null });
        const image = base.systemImage ? imagesById.get(base.systemImage) ?? null : null;
        const described = describeAvd({ name: entry.name, topIni: entry.topIni, config, path: entry.avdPath, image });
        if (!entry.config) described.problem = `config.ini is missing in ${entry.avdPath}`;
        const [sizeOnDiskBytes, snapshotEntries] = await Promise.all([
          this.sizeOf(entry.avdPath),
          readDir(path.join(entry.avdPath, 'snapshots')),
        ]);
        const live = running.get(entry.name);
        const tracker = this.boots.get(entry.name);
        const lockPid = live ? null : await this.lockedPid(entry.avdPath);
        let state: AvdInfo['state'] = 'stopped';
        if (this.stopping.has(entry.name)) state = 'stopping';
        else if (live) state = live.booted ? 'running' : 'booting';
        else if (tracker && !tracker.finishedAt) state = 'starting';
        else if (lockPid) state = 'booting';
        return {
          ...described,
          sizeOnDiskBytes,
          snapshots: snapshotEntries.filter((item) => item.isDirectory()).map((item) => item.name).sort(),
          state,
          serial: live?.serial ?? tracker?.progress.serial ?? null,
          boot: tracker ? { ...tracker.progress } : null,
        };
      })
    );

    // AVDs the emulator knows about but whose files live elsewhere.
    const known = new Set(avds.map((avd) => avd.name));
    for (const name of emulatorNames) {
      if (known.has(name)) continue;
      avds.push({
        ...describeAvd({ name, topIni: {}, config: {}, path: '', image: undefined }),
        problem: `Listed by the emulator, but its files are not in ${setup.avdHome}`,
        sizeOnDiskBytes: null,
        snapshots: [],
        state: running.has(name) ? 'running' : 'stopped',
        serial: running.get(name)?.serial ?? null,
        boot: null,
      });
    }
    avds.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
    return { setup, avds };
  }

  // ---------- start / stop ----------

  private emitBoot(tracker: BootTracker): void {
    this.emit('boot', { ...tracker.progress });
  }

  private pruneBoots(): void {
    const now = Date.now();
    for (const [name, tracker] of this.boots) {
      if (tracker.finishedAt && now - tracker.finishedAt > FINISHED_RETENTION_MS) this.boots.delete(name);
    }
  }

  async startAvd(name: string, options: StartAvdOptions = {}): Promise<BootProgress> {
    const { setup, entry } = await this.findEntry(name);
    if (!setup.emulatorPath) throw new EmulatorError('Android Emulator is not installed. Install it from Android Studio › SDK Manager › SDK Tools.');
    if (!entry.config) throw new EmulatorError(`${name} has no config.ini, so it cannot start`);
    const active = this.boots.get(name);
    if (active && !active.finishedAt) throw new EmulatorError(`${name} is already starting`);
    const running = await this.runningEmulators();
    if (running.has(name) || (await this.lockedPid(entry.avdPath))) throw new EmulatorError(`${name} is already running`);
    const described = describeAvd({ name, topIni: entry.topIni, config: entry.config, path: entry.avdPath });
    if (described.systemImage && setup.sdkPath) {
      const parts = parseSystemImageId(described.systemImage);
      if (parts && !(await exists(path.join(setup.sdkPath, 'system-images', parts.platform, parts.tagId, parts.abi)))) {
        throw new EmulatorError(`Its system image (${described.systemImage}) is not installed. Download it under System images.`);
      }
    }

    const cleanOptions: StartAvdOptions = {
      coldBoot: !!options.coldBoot,
      wipeData: !!options.wipeData,
      headless: !!options.headless,
      noAudio: !!options.noAudio,
    };
    const args = buildEmulatorArgs(name, cleanOptions);
    await fs.promises.mkdir(this.logDir, { recursive: true });
    const logPath = path.join(this.logDir, `${name}.log`);
    const fd = fs.openSync(logPath, 'w');
    let child: ChildProcess;
    try {
      // Detached with its output in a file: the emulator keeps running (and
      // logging) after Android Debugger quits.
      child = spawn(setup.emulatorPath, args, {
        detached: true,
        stdio: ['ignore', fd, fd],
        env: this.toolEnv(setup),
        cwd: path.dirname(setup.emulatorPath),
        windowsHide: true,
      });
    } finally {
      fs.closeSync(fd);
    }
    child.unref();

    const tracker: BootTracker = {
      progress: {
        name,
        phase: 'launching',
        startedAt: Date.now(),
        serial: null,
        message: cleanOptions.wipeData ? 'Wiping data and starting…' : 'Starting the emulator…',
        options: cleanOptions,
      },
      polls: 0,
      child,
      exitCode: undefined,
      logPath,
      timer: null,
      finishedAt: null,
    };
    child.once('exit', (code) => {
      tracker.exitCode = code;
    });
    child.once('error', (error) => {
      this.finishBoot(tracker, 'failed', 'Could not start the emulator', error.message);
    });
    this.boots.set(name, tracker);
    this.listAvdsCache = null;
    this.emitBoot(tracker);
    this.scheduleBootPoll(tracker);
    return { ...tracker.progress };
  }

  private scheduleBootPoll(tracker: BootTracker): void {
    tracker.timer = setTimeout(() => {
      tracker.timer = null;
      void this.pollBoot(tracker);
    }, BOOT_POLL_MS);
  }

  private finishBoot(tracker: BootTracker, phase: 'ready' | 'failed', message: string, error?: string): void {
    if (tracker.finishedAt) return;
    if (tracker.timer) clearTimeout(tracker.timer);
    tracker.timer = null;
    tracker.finishedAt = Date.now();
    tracker.progress = { ...tracker.progress, phase, message, ...(error ? { error } : {}) };
    tracker.child = null;
    this.emitBoot(tracker);
    this.emit('changed');
  }

  private async pollBoot(tracker: BootTracker): Promise<void> {
    if (this.disposed || tracker.finishedAt || this.boots.get(tracker.progress.name) !== tracker) return;
    const { name } = tracker.progress;
    const elapsed = Date.now() - tracker.progress.startedAt;
    tracker.polls += 1;
    try {
      // Every ~6 s, look for trouble the emulator only reports in its log.
      if (!tracker.progress.warning && tracker.polls % 4 === 0) {
        const warning = emulatorBootWarning(((await readText(tracker.logPath)) ?? '').slice(0, 256 * 1024));
        if (warning && !tracker.finishedAt) {
          tracker.progress = { ...tracker.progress, warning };
          this.emitBoot(tracker);
        }
      }
      const live = (await this.runningEmulators()).get(name);
      if (tracker.finishedAt) return;
      if (live) {
        tracker.progress.serial = live.serial;
        if (live.booted) {
          this.finishBoot(tracker, 'ready', 'Ready');
          return;
        }
        const message = live.status === 'device' ? 'Booting Android…' : 'Connecting to adb…';
        if (tracker.progress.phase !== 'booting' || tracker.progress.message !== message) {
          tracker.progress = { ...tracker.progress, phase: 'booting', message };
          this.emitBoot(tracker);
        }
      } else if (tracker.exitCode !== undefined) {
        // The launcher exited without the emulator ever reaching adb.
        await delay(1_000);
        const log = (await readText(tracker.logPath)) ?? '';
        const errors = extractEmulatorErrors(log.slice(-64 * 1024));
        this.finishBoot(
          tracker,
          'failed',
          'The emulator quit while starting',
          errors.at(-1) ?? `The emulator exited with code ${tracker.exitCode ?? 'unknown'}. Its log is at ${tracker.logPath}.`
        );
        return;
      } else if (elapsed > WAITING_AFTER_MS && tracker.progress.phase === 'launching') {
        tracker.progress = { ...tracker.progress, phase: 'waiting-for-device', message: 'Waiting for the emulator to show up in adb…' };
        this.emitBoot(tracker);
      }
      if (elapsed > BOOT_TIMEOUT_MS) {
        this.finishBoot(
          tracker,
          'failed',
          'Boot is taking too long',
          `It has not finished booting after ${Math.round(BOOT_TIMEOUT_MS / 60_000)} minutes. It may still be starting; check its window or log (${tracker.logPath}).`
        );
        return;
      }
    } catch (error) {
      console.error('Emulator boot poll failed:', error);
    }
    this.scheduleBootPoll(tracker);
  }

  /** Resolves once a boot started here is ready or failed, or after `timeoutMs`. */
  waitForBoot(name: string, timeoutMs: number): Promise<BootProgress | null> {
    const tracker = this.boots.get(name);
    if (!tracker) return Promise.resolve(null);
    if (tracker.finishedAt) return Promise.resolve({ ...tracker.progress });
    return new Promise((resolve) => {
      const onBoot = (progress: BootProgress) => {
        if (progress.name !== name || (progress.phase !== 'ready' && progress.phase !== 'failed')) return;
        cleanup();
        resolve(progress);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve({ ...tracker.progress });
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off('boot', onBoot);
      };
      this.on('boot', onBoot);
    });
  }

  async stopAvd(name: string): Promise<void> {
    const { entry } = await this.findEntry(name);
    if (this.stopping.has(name)) return;
    this.stopping.add(name);
    this.emit('changed');
    try {
      const tracker = this.boots.get(name);
      const live = (await this.runningEmulators()).get(name);
      const serial = live?.serial ?? tracker?.progress.serial ?? null;
      let lockPid = await this.lockedPid(entry.avdPath);
      if (!serial && !lockPid && !(tracker && !tracker.finishedAt && tracker.child?.pid)) {
        throw new EmulatorError(`${name} is not running`);
      }
      if (serial) await adbEmulator(serial, ['emu', 'kill'], 5_000);
      const gone = async () => !(await this.runningEmulators()).has(name) && !(await this.lockedPid(entry.avdPath));
      const deadline = Date.now() + (serial ? STOP_WAIT_MS : 0);
      while (Date.now() < deadline) {
        if (await gone()) break;
        await delay(750);
      }
      if (!(await gone())) {
        // The console did not answer: end the process directly.
        lockPid = lockPid ?? (await this.lockedPid(entry.avdPath));
        const childPid = tracker && tracker.exitCode === undefined ? tracker.child?.pid ?? null : null;
        const pid = lockPid ?? childPid;
        // Re-check right before signalling: never kill a PID that is no longer an emulator.
        if (pid && pidAlive(pid) && (await this.isEmulatorProcess(pid, true))) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch {
            // Already gone
          }
          const killDeadline = Date.now() + 5_000;
          while (Date.now() < killDeadline && pidAlive(pid)) await delay(250);
          if (pidAlive(pid)) {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {
              // Already gone
            }
          }
        }
      }
      if (tracker && !tracker.finishedAt) this.finishBoot(tracker, 'failed', 'Stopped before it finished booting', 'Stopped');
      this.boots.delete(name);
      if (serial) {
        this.serialNames.delete(serial);
        this.bootedSerials.delete(serial);
      }
    } finally {
      this.stopping.delete(name);
      this.sizeCache.delete(entry.avdPath);
      this.emit('changed');
    }
  }

  private async assertStopped(name: string, avdPath: string, action: string): Promise<void> {
    const tracker = this.boots.get(name);
    if (this.stopping.has(name) || (tracker && !tracker.finishedAt)) throw new EmulatorError(`Stop ${name} before you ${action} it`);
    if ((await this.runningEmulators()).has(name) || (await this.lockedPid(avdPath))) {
      throw new EmulatorError(`Stop ${name} before you ${action} it`);
    }
  }

  // ---------- create / delete / wipe / rename ----------

  async listDeviceProfiles(force = false): Promise<DeviceProfile[]> {
    if (this.profilesCache && !force) return this.profilesCache;
    const setup = await this.getSetup();
    if (!setup.avdmanagerPath || !setup.canCreate) throw new EmulatorError(this.createUnavailableReason(setup));
    const result = await this.runTool(setup.avdmanagerPath, ['list', 'device'], setup, { timeoutMs: LIST_TIMEOUT_MS });
    const profiles = sortDeviceProfiles(parseDeviceProfiles(result.stdout));
    if (result.code !== 0 || profiles.length === 0) throw new EmulatorError(this.toolError(result, 'avdmanager could not list device profiles'));
    this.profilesCache = profiles;
    return profiles;
  }

  private createUnavailableReason(setup: EmulatorSetup): string {
    const issue = setup.issues.find((item) => item.id === 'sdk' || item.id === 'cmdline-tools' || item.id === 'java');
    return issue ? `${issue.title}. ${issue.detail}` : 'avdmanager is not available';
  }

  async createAvd(request: CreateAvdRequest): Promise<AvdInfo> {
    const setup = await this.getSetup(true);
    if (!setup.avdmanagerPath || !setup.canCreate || !setup.sdkPath) throw new EmulatorError(this.createUnavailableReason(setup));
    const name = String(request?.name ?? '').trim();
    const existing = (await this.readAvdEntries(setup.avdHome)).map((entry) => entry.name);
    const nameProblem = validateAvdName(name, existing);
    if (nameProblem) throw new EmulatorError(nameProblem);
    if (!isValidSystemImageId(request.systemImage)) throw new EmulatorError('Choose an installed system image');
    const parts = parseSystemImageId(request.systemImage)!;
    if (!(await exists(path.join(setup.sdkPath, 'system-images', parts.platform, parts.tagId, parts.abi, 'source.properties')))) {
      throw new EmulatorError(`${request.systemImage} is not installed. Download it first.`);
    }
    const profiles = await this.listDeviceProfiles();
    if (!profiles.some((profile) => profile.id === request.device)) {
      throw new EmulatorError(`Unknown device profile "${request.device}"`);
    }
    const clean: CreateAvdRequest = {
      name,
      systemImage: request.systemImage,
      device: request.device,
      displayName: typeof request.displayName === 'string' ? request.displayName.slice(0, 80) : undefined,
      ramMb: clampOptional(request.ramMb, 512, 65_536),
      storageGb: clampOptional(request.storageGb, 1, 512),
      sdCardMb: clampOptional(request.sdCardMb, 0, 65_536),
    };
    // "Do you wish to create a custom hardware profile? [no]" is answered on stdin.
    const result = await this.runTool(setup.avdmanagerPath, buildCreateAvdArgs(clean), setup, {
      timeoutMs: CREATE_TIMEOUT_MS,
      input: 'no\n',
    });
    const entry = (await this.readAvdEntries(setup.avdHome)).find((candidate) => candidate.name === name);
    if (result.code !== 0 || !entry) throw new EmulatorError(this.toolError(result, 'avdmanager could not create the emulator'));
    const configPath = path.join(entry.avdPath, 'config.ini');
    const configText = await readText(configPath);
    if (configText !== null) await fs.promises.writeFile(configPath, updateIniText(configText, createConfigPatch(clean)), 'utf8');
    this.listAvdsCache = null;
    this.emit('changed');
    const created = (await this.listAvds()).avds.find((avd) => avd.name === name);
    if (!created) throw new EmulatorError('The emulator was created but could not be read back');
    return created;
  }

  async deleteAvd(name: string): Promise<void> {
    const { entry } = await this.findEntry(name);
    await this.assertStopped(name, entry.avdPath, 'delete');
    // Only remove what is recognisably an AVD folder.
    const looksLikeAvd = entry.avdPath.endsWith('.avd') && (await exists(path.join(entry.avdPath, 'config.ini')));
    if (looksLikeAvd) await fs.promises.rm(entry.avdPath, { recursive: true, force: true });
    else if (await exists(entry.avdPath)) throw new EmulatorError(`${entry.avdPath} does not look like an emulator folder, so it was left alone`);
    await fs.promises.rm(entry.iniPath, { force: true });
    await fs.promises.rm(path.join(this.logDir, `${name}.log`), { force: true });
    this.boots.delete(name);
    this.sizeCache.delete(entry.avdPath);
    this.listAvdsCache = null;
    this.emit('changed');
  }

  async wipeAvd(name: string): Promise<void> {
    const { entry } = await this.findEntry(name);
    await this.assertStopped(name, entry.avdPath, 'wipe');
    const targets = wipeTargets((await readDir(entry.avdPath)).map((item) => item.name));
    for (const target of targets) await fs.promises.rm(path.join(entry.avdPath, target), { recursive: true, force: true });
    this.sizeCache.delete(entry.avdPath);
    this.emit('changed');
  }

  async renameAvd(name: string, newName: string): Promise<void> {
    const { setup, entry } = await this.findEntry(name);
    if (!setup.avdmanagerPath || !setup.canCreate) throw new EmulatorError(this.createUnavailableReason(setup));
    await this.assertStopped(name, entry.avdPath, 'rename');
    const next = String(newName ?? '').trim();
    const existing = (await this.readAvdEntries(setup.avdHome)).map((item) => item.name).filter((item) => item !== name);
    const problem = next === name ? 'Enter a different name' : validateAvdName(next, existing);
    if (problem) throw new EmulatorError(problem);
    const result = await this.runTool(setup.avdmanagerPath, ['move', 'avd', '--name', name, '--rename', next], setup, {
      timeoutMs: CREATE_TIMEOUT_MS,
    });
    if (result.code !== 0 || !(await exists(path.join(setup.avdHome, `${next}.ini`)))) {
      throw new EmulatorError(this.toolError(result, 'avdmanager could not rename the emulator'));
    }
    this.sizeCache.delete(entry.avdPath);
    this.listAvdsCache = null;
    this.emit('changed');
  }

  async deleteSnapshot(name: string, snapshot: string): Promise<void> {
    if (!/^[A-Za-z0-9._-]+$/.test(snapshot) || snapshot.startsWith('.')) throw new EmulatorError('Invalid snapshot name');
    const { entry } = await this.findEntry(name);
    await this.assertStopped(name, entry.avdPath, 'change the snapshots of');
    await fs.promises.rm(path.join(entry.avdPath, 'snapshots', snapshot), { recursive: true, force: true });
    this.sizeCache.delete(entry.avdPath);
    this.emit('changed');
  }

  async avdPath(name: string): Promise<string> {
    return (await this.findEntry(name)).entry.avdPath;
  }

  // ---------- system image downloads ----------

  async listAvailableImages(force = false): Promise<AvailableImagesResult> {
    if (!force && this.availableCache && Date.now() - this.availableCache.fetchedAt < AVAILABLE_CACHE_MS) {
      const installed = new Set((await this.listSystemImages()).map((image) => image.id));
      return { ...this.availableCache, images: this.availableCache.images.filter((image) => !installed.has(image.id)) };
    }
    const setup = await this.getSetup();
    if (!setup.sdkmanagerPath || !setup.canDownload) throw new EmulatorError(this.createUnavailableReason(setup));
    const result = await this.runTool(setup.sdkmanagerPath, ['--list'], setup, { timeoutMs: LIST_TIMEOUT_MS });
    const list = parseSdkmanagerList(result.stdout);
    if (result.code !== 0 && list.available.length === 0) {
      throw new EmulatorError(this.toolError(result, 'sdkmanager could not list packages. Check your internet connection.'));
    }
    const installed = new Set((await this.listSystemImages(setup)).map((image) => image.id));
    this.availableCache = { images: availableSystemImages(list, setup.hostAbi, installed), fetchedAt: Date.now() };
    return this.availableCache;
  }

  getInstallJobs(): ImageInstallJob[] {
    const now = Date.now();
    for (const [id, internal] of this.jobs) {
      if (internal.finishedAt && now - internal.finishedAt > FINISHED_RETENTION_MS * 5) this.jobs.delete(id);
    }
    return [...this.jobs.values()].map((internal) => ({ ...internal.job }));
  }

  private emitJob(internal: InstallJobInternal): void {
    this.emit('install', { ...internal.job, license: internal.job.license ? { ...internal.job.license } : null });
  }

  async installImage(packageId: string): Promise<ImageInstallJob> {
    if (!isValidSystemImageId(packageId)) throw new EmulatorError('Not a system image package id');
    const setup = await this.getSetup();
    if (!setup.sdkmanagerPath || !setup.canDownload || !setup.sdkPath) throw new EmulatorError(this.createUnavailableReason(setup));
    for (const internal of this.jobs.values()) {
      if (!internal.finishedAt) {
        throw new EmulatorError(
          internal.job.packageId === packageId ? 'This image is already downloading' : 'Another system image is downloading. Wait for it to finish.'
        );
      }
    }
    const parts = parseSystemImageId(packageId)!;
    const imageDir = path.join(setup.sdkPath, 'system-images', parts.platform, parts.tagId, parts.abi);
    if (await exists(path.join(imageDir, 'source.properties'))) throw new EmulatorError('This image is already installed');

    const internal: InstallJobInternal = {
      job: {
        id: randomUUID(),
        packageId,
        phase: 'preparing',
        percent: null,
        message: 'Preparing…',
        license: null,
        startedAt: Date.now(),
      },
      child: null,
      output: '',
      idleTimer: null,
      declined: false,
      cancelled: false,
      finishedAt: null,
    };
    this.jobs.set(internal.job.id, internal);
    const child = this.spawnTool(setup.sdkmanagerPath, ['--install', packageId], setup);
    internal.child = child;
    const parser = new SdkInstallOutputParser();

    const armIdle = () => {
      if (internal.idleTimer) clearTimeout(internal.idleTimer);
      internal.idleTimer = setTimeout(() => {
        if (internal.job.phase === 'license' || internal.finishedAt) return;
        internal.job = { ...internal.job, error: 'sdkmanager stopped responding' };
        killTree(child);
      }, INSTALL_IDLE_TIMEOUT_MS);
    };
    const onData = (chunk: string) => {
      internal.output = (internal.output + chunk).slice(-256 * 1024);
      armIdle();
      for (const event of parser.feed(chunk)) {
        if (event.type === 'license') {
          internal.job = { ...internal.job, phase: 'license', license: { id: event.id, text: event.text }, message: 'Waiting for you to review the license' };
        } else {
          const phase = /download/i.test(event.message)
            ? 'downloading'
            : /unzip|install|extract/i.test(event.message)
              ? 'installing'
              : internal.job.phase === 'license'
                ? 'license'
                : 'preparing';
          internal.job = { ...internal.job, phase, percent: phase === 'preparing' ? null : event.percent, message: event.message };
        }
        this.emitJob(internal);
      }
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.stdin?.on('error', () => {});
    child.once('error', (error) => {
      internal.job = { ...internal.job, error: error.message };
    });
    child.once('close', async (code) => {
      if (internal.idleTimer) clearTimeout(internal.idleTimer);
      const installed = await exists(path.join(imageDir, 'source.properties'));
      internal.finishedAt = Date.now();
      internal.child = null;
      if (installed && code === 0) {
        internal.job = { ...internal.job, phase: 'done', percent: 100, message: 'Installed', license: null };
        this.availableCache = null;
        this.emit('changed');
      } else if (internal.cancelled || internal.declined) {
        internal.job = {
          ...internal.job,
          phase: 'cancelled',
          license: null,
          message: internal.declined ? 'License declined. Nothing was downloaded.' : 'Download cancelled',
        };
      } else {
        internal.job = {
          ...internal.job,
          phase: 'failed',
          license: null,
          message: 'Download failed',
          error: internal.job.error ?? sdkmanagerFailure(internal.output) ?? `sdkmanager exited with code ${code ?? 'unknown'}`,
        };
      }
      this.emitJob(internal);
    });
    armIdle();
    this.emitJob(internal);
    return { ...internal.job };
  }

  respondToLicense(jobId: string, accept: boolean): void {
    const internal = this.jobs.get(jobId);
    if (!internal || internal.finishedAt || !internal.child) throw new EmulatorError('This download is no longer running');
    if (internal.job.phase !== 'license') throw new EmulatorError('No license is waiting for an answer');
    if (!accept) internal.declined = true;
    // Answer exactly the prompt the user saw; never pre-accept licenses.
    internal.child.stdin?.write(accept ? 'y\n' : 'n\n');
    internal.job = { ...internal.job, phase: 'preparing', license: null, message: accept ? 'License accepted' : 'Declining…' };
    this.emitJob(internal);
  }

  cancelInstall(jobId: string): void {
    const internal = this.jobs.get(jobId);
    if (!internal || internal.finishedAt || !internal.child) return;
    internal.cancelled = true;
    const child = internal.child;
    killTree(child);
    setTimeout(() => killTree(child, 'SIGKILL'), 3_000).unref();
  }

  // ---------- lifecycle ----------

  /** Stops tool processes and boot watchers. Running emulators are left alone. */
  async stopAll(): Promise<void> {
    this.disposed = true;
    for (const tracker of this.boots.values()) {
      if (tracker.timer) clearTimeout(tracker.timer);
      tracker.timer = null;
    }
    for (const internal of this.jobs.values()) {
      if (internal.idleTimer) clearTimeout(internal.idleTimer);
      internal.cancelled = true;
    }
    const children = [...this.tools];
    for (const child of children) killTree(child);
    if (children.length === 0) return;
    await delay(500);
    for (const child of children) killTree(child, 'SIGKILL');
  }
}

function clampOptional(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export const emulatorService = new EmulatorService();
