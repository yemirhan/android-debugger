/**
 * The MCP tools Android Debugger exposes. Each tool reuses the same AdbService
 * methods, capture helpers and main-process buffers the UI uses; nothing here
 * talks to adb on its own. Electron-specific pieces (window, image encoding,
 * selection sync) come in through McpToolHost so this file stays testable.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import { z } from 'zod';
import type { Device, IntentConfig, LogLevel, SdkBridgeStatus } from '@android-debugger/shared';
import type { AdbService } from './adb';
import type { EmulatorService } from './emulator-service';
import type { AvdInfo } from './emulator-types';
import { abisForHost, defaultDeviceProfile, profileCategoriesForTag, suggestAvdName } from './emulator-parsers';
import { APP_TABS, type AppSection, type AppTabId } from './app-tabs';
import type { LogStreamMode } from './logcat-format';
import {
  formatLogLineForMcp,
  parseSince,
  queryLogLines,
  queryNetworkRequests,
  summarizeSeries,
  truncateText,
  type McpDataStore,
  type MonitorSample,
} from './mcp-store';
import { checkSavePath } from './mcp-security';

export interface McpSelection {
  deviceId: string | null;
  packageName: string;
}

export interface McpToolHost {
  adb: AdbService;
  emulators: EmulatorService;
  store: McpDataStore;
  appVersion: string;
  getSelection: () => McpSelection;
  getSdkBridgeStatus: () => SdkBridgeStatus;
  /** Selects in main and in the UI; resolves once the UI shows it (or after a short wait). */
  selectTarget: (target: { deviceId: string; packageName?: string }) => Promise<McpSelection & { uiConfirmed: boolean }>;
  /** Switches the desktop app's tab and brings its window to the front. */
  navigate: (tab: AppTabId, section?: AppSection) => void;
  isRiskyAllowed: () => boolean;
  capturesDir: () => string;
  /** Saves a screenshot; `savePath` overrides the captures folder. */
  captureScreenshot: (deviceId: string, deviceLabel: string, savePath?: string) => Promise<{ path: string; bytes: number }>;
  /** PNG scaled to fit `maxDimension`, base64-encoded. */
  encodeImage: (
    filePath: string,
    maxDimension: number
  ) => { data: string; mimeType: string; width: number; height: number; originalWidth: number; originalHeight: number };
  startRecording: (deviceId: string, deviceLabel: string, savePath?: string) => Promise<{ success: boolean; path?: string }>;
  stopRecording: (deviceId: string) => Promise<{ success: boolean; path?: string }>;
  sendMetroCommand: (port: number, method: 'reload' | 'devMenu') => Promise<{ ok: boolean; error?: string }>;
  openDevMenuViaAdb: (deviceId: string) => Promise<{ ok: boolean; error?: string }>;
}

export const RISKY_TOOLS = ['run_shell', 'uninstall_app', 'clear_app_data', 'install_app', 'delete_emulator'] as const;

/** Thrown for problems the assistant can fix; the message is shown as-is. */
class ToolError extends Error {}

const SETTINGS_HINT = 'Android Debugger → Settings → AI assistants (MCP)';

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function json(value: unknown, note?: string): CallToolResult {
  const body = JSON.stringify(value, null, 2);
  return text(note ? `${note}\n\n${body}` : body);
}

function failure(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function describe(error: unknown): string {
  if (error instanceof ToolError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': /, '');
}

const PACKAGE_RE = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/;

const deviceArg = z
  .string()
  .min(1)
  .optional()
  .describe('Device serial from list_devices. Defaults to the device selected in Android Debugger.');
const appArg = z
  .string()
  .min(1)
  .optional()
  .describe('Package name, e.g. com.example.app. Defaults to the app selected in Android Debugger.');
const sinceArg = z
  .string()
  .optional()
  .describe('Only items newer than this: "30s", "5m", "2h", an ISO time, or epoch milliseconds.');

function deviceLabel(device: Pick<Device, 'id' | 'model'>): string {
  return device.model && device.model !== 'Unknown' ? device.model : device.id;
}

export function registerMcpTools(server: McpServer, host: McpToolHost): void {
  const { adb, store } = host;

  // ---------- target resolution ----------

  async function resolveDevice(requested?: string): Promise<Device> {
    const devices = await adb.getDevices();
    const ready = devices.filter((device) => device.status === 'device');
    const describeList = () =>
      devices.length ? devices.map((device) => `${device.id} (${device.status})`).join(', ') : 'none';

    const check = (device: Device): Device => {
      if (device.status === 'unauthorized') {
        throw new ToolError(`${device.id} is unauthorized. Unlock it and accept the "Allow USB debugging" prompt.`);
      }
      if (device.status !== 'device') throw new ToolError(`${device.id} is ${device.status}. Reconnect it and try again.`);
      return device;
    };

    if (requested) {
      const device = devices.find((candidate) => candidate.id === requested);
      if (!device) throw new ToolError(`Device "${requested}" is not connected. Connected devices: ${describeList()}.`);
      return check(device);
    }
    const selectedId = host.getSelection().deviceId;
    const selected = selectedId ? devices.find((device) => device.id === selectedId) : undefined;
    if (selected?.status === 'device') return selected;
    if (ready.length === 1) return ready[0];
    if (ready.length === 0) {
      throw new ToolError(
        devices.length
          ? `No device is ready (${describeList()}). Unlock the device and allow USB debugging.`
          : 'No Android device is connected. Start an emulator or plug in a phone with USB debugging on, then call list_devices.'
      );
    }
    throw new ToolError(
      `Several devices are connected (${ready.map((device) => device.id).join(', ')}). Pass "device" or call select_device first.`
    );
  }

  function resolveApp(requested?: string): string {
    const packageName = requested?.trim() || host.getSelection().packageName;
    if (!packageName) {
      throw new ToolError('No app is selected. Call list_apps and then select_app, or pass "app" (a package name).');
    }
    if (!PACKAGE_RE.test(packageName)) throw new ToolError(`"${packageName}" is not a valid Android package name.`);
    return packageName;
  }

  function validateSavePath(savePath: string, extension: string): string {
    const check = checkSavePath(savePath, extension, host.capturesDir(), {
      riskyAllowed: host.isRiskyAllowed(),
      exists: (filePath) => fs.existsSync(filePath),
      settingsHint: SETTINGS_HINT,
    });
    if (!check.ok) throw new ToolError(check.message);
    return check.path;
  }

  function riskyRefusal(what: string): CallToolResult {
    return failure(
      `${what} To allow it, open ${SETTINGS_HINT} and turn on "Allow risky tools" ` +
        '(navigate_ui with tab "settings" opens that screen). Ask the user before enabling it.'
    );
  }

  /** Registers a tool whose handler errors become isError results with a readable message. */
  function tool<Shape extends z.ZodRawShape>(
    name: string,
    config: { title: string; description: string; inputSchema: Shape; readOnly?: boolean; destructive?: boolean },
    handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<CallToolResult>
  ): void {
    const risky = (RISKY_TOOLS as readonly string[]).includes(name);
    server.registerTool(
      name,
      {
        title: config.title,
        description: risky
          ? `${config.description} Risky: off unless "Allow risky tools" is on in ${SETTINGS_HINT}.`
          : config.description,
        inputSchema: config.inputSchema,
        annotations: {
          title: config.title,
          readOnlyHint: config.readOnly ?? false,
          destructiveHint: config.destructive ?? false,
          openWorldHint: false,
        },
      },
      (async (args: z.infer<z.ZodObject<Shape>>) => {
        if (risky && !host.isRiskyAllowed()) return riskyRefusal(`${name} is a risky tool and is turned off.`);
        try {
          return await handler(args);
        } catch (error) {
          return failure(describe(error));
        }
      }) as never
    );
  }

  // ---------- devices & apps ----------

  tool(
    'list_devices',
    {
      title: 'List devices',
      description:
        'Lists Android devices and emulators visible to adb, with their status and which one Android Debugger has selected.',
      inputSchema: {},
      readOnly: true,
    },
    async () => {
      const devices = await adb.getDevices();
      const selection = host.getSelection();
      return json({
        selectedDevice: selection.deviceId,
        selectedApp: selection.packageName || null,
        devices: devices.map((device) => ({ ...device, selected: device.id === selection.deviceId })),
        hint: devices.length
          ? undefined
          : 'No devices. Start an emulator or connect a phone with USB debugging turned on.',
      });
    }
  );

  tool(
    'select_device',
    {
      title: 'Select device',
      description:
        'Selects the device Android Debugger works with (the UI switches too). Other tools default to this device.',
      inputSchema: { device: z.string().min(1).describe('Device serial from list_devices.') },
    },
    async ({ device }) => {
      const target = await resolveDevice(device);
      const result = await host.selectTarget({ deviceId: target.id });
      return json(
        { selectedDevice: result.deviceId, selectedApp: result.packageName || null, uiUpdated: result.uiConfirmed },
        `Selected ${deviceLabel(target)} (${target.id}).`
      );
    }
  );

  tool(
    'get_device_info',
    {
      title: 'Get device info',
      description: 'Model, Android version, API level, ABIs, screen size and density, Wi-Fi and battery for a device.',
      inputSchema: { device: deviceArg },
      readOnly: true,
    },
    async ({ device }) => {
      const target = await resolveDevice(device);
      const [spec, battery, screen] = await Promise.all([
        adb.getDeviceSpec(target.id).catch(() => null),
        adb.getBatteryInfo(target.id).catch(() => null),
        adb.runShell(target.id, 'wm size; wm density', 10_000).catch(() => null),
      ]);
      // "Override" (when set) wins over "Physical", and it is printed last.
      const size = screen?.stdout.match(/(?:Override|Physical) size:\s*(\d+)x(\d+)/g)?.pop()?.match(/(\d+)x(\d+)/);
      const density = Number(screen?.stdout.match(/(?:Override|Physical) density:\s*(\d+)/g)?.pop()?.match(/(\d+)/)?.[1]);
      return json({
        id: target.id,
        model: target.model,
        androidVersion: target.androidVersion,
        apiLevel: spec?.sdkVersion || null,
        abis: spec?.abis ?? [],
        screen: size
          ? { width: Number(size[1]), height: Number(size[2]), densityDpi: density || spec?.screenDensity || null }
          : null,
        wifi: target.wifiName ?? null,
        battery,
      });
    }
  );

  tool(
    'list_apps',
    {
      title: 'List apps',
      description:
        'Lists installed packages on a device. By default only debuggable apps (the ones Android Debugger can inspect) are listed.',
      inputSchema: {
        device: deviceArg,
        debuggableOnly: z.boolean().default(true).describe('Only debuggable apps (default true). False lists every package.'),
        filter: z.string().optional().describe('Case-insensitive substring to match package names.'),
        limit: z.number().int().min(1).max(2000).default(300),
      },
      readOnly: true,
    },
    async ({ device, debuggableOnly, filter, limit }) => {
      const target = await resolveDevice(device);
      const needle = filter?.toLowerCase();
      const packages = (await adb.getPackages(target.id, debuggableOnly))
        .filter((name) => !needle || name.toLowerCase().includes(needle))
        .sort((a, b) => a.localeCompare(b));
      return json({
        device: target.id,
        debuggableOnly,
        total: packages.length,
        packages: packages.slice(0, limit),
        selectedApp: host.getSelection().packageName || null,
        hint:
          packages.length === 0 && debuggableOnly
            ? 'No debuggable apps found. Install a debug build, or pass debuggableOnly: false.'
            : undefined,
      });
    }
  );

  tool(
    'select_app',
    {
      title: 'Select app',
      description:
        'Selects the app Android Debugger inspects (the UI switches too). Logs, performance and SDK data follow this app.',
      inputSchema: {
        app: z.string().min(1).describe('Package name, e.g. com.example.app.'),
        device: deviceArg,
      },
    },
    async ({ app, device }) => {
      const packageName = resolveApp(app);
      const target = await resolveDevice(device);
      const installed = await adb.getPackages(target.id, false);
      if (!installed.includes(packageName)) {
        throw new ToolError(`${packageName} is not installed on ${target.id}. Call list_apps to see what is installed.`);
      }
      const debuggable = (await adb.getPackages(target.id, true)).includes(packageName);
      const result = await host.selectTarget({ deviceId: target.id, packageName });
      return json(
        {
          selectedDevice: result.deviceId,
          selectedApp: result.packageName || null,
          debuggable,
          uiUpdated: result.uiConfirmed,
        },
        debuggable
          ? `Selected ${packageName} on ${target.id}.`
          : `Selected ${packageName} on ${target.id}. It is not debuggable, so memory, files and some profiling tools may not work.`
      );
    }
  );

  tool(
    'launch_app',
    {
      title: 'Launch app',
      description: 'Starts an app through its launcher activity.',
      inputSchema: { app: appArg, device: deviceArg },
    },
    async ({ app, device }) => {
      const packageName = resolveApp(app);
      const target = await resolveDevice(device);
      await adb.launchApp(target.id, packageName);
      return text(`Launched ${packageName} on ${target.id}.`);
    }
  );

  tool(
    'stop_app',
    {
      title: 'Force-stop app',
      description: 'Force-stops an app (am force-stop).',
      inputSchema: { app: appArg, device: deviceArg },
    },
    async ({ app, device }) => {
      const packageName = resolveApp(app);
      const target = await resolveDevice(device);
      await adb.killApp(target.id, packageName);
      return text(`Force-stopped ${packageName} on ${target.id}.`);
    }
  );

  tool(
    'restart_app',
    {
      title: 'Restart app',
      description: 'Force-stops an app and launches it again (a cold start).',
      inputSchema: { app: appArg, device: deviceArg },
    },
    async ({ app, device }) => {
      const packageName = resolveApp(app);
      const target = await resolveDevice(device);
      await adb.killApp(target.id, packageName);
      await adb.launchApp(target.id, packageName);
      return text(`Restarted ${packageName} on ${target.id}.`);
    }
  );

  tool(
    'clear_app_data',
    {
      title: 'Clear app data',
      description: 'Deletes all of an app\'s data and cache (pm clear), like a fresh install. Cannot be undone.',
      inputSchema: { app: appArg, device: deviceArg },
      destructive: true,
    },
    async ({ app, device }) => {
      const packageName = resolveApp(app);
      const target = await resolveDevice(device);
      await adb.clearAppData(target.id, packageName);
      return text(`Cleared all data for ${packageName} on ${target.id}.`);
    }
  );

  tool(
    'install_app',
    {
      title: 'Install app',
      description:
        'Installs an .apk or .aab file from this computer. AAB installs need Java; bundletool is downloaded on first use.',
      inputSchema: {
        path: z.string().min(1).describe('Absolute path to an .apk or .aab file on this computer.'),
        device: deviceArg,
        reinstall: z.boolean().default(true).describe('Replace an existing install, keeping its data (-r).'),
        allowDowngrade: z.boolean().default(false).describe('Allow installing an older version (-d).'),
        grantPermissions: z.boolean().default(false).describe('Grant all runtime permissions (-g).'),
      },
      destructive: true,
    },
    async ({ path: filePath, device, reinstall, allowDowngrade, grantPermissions }) => {
      if (!/^(\/|[A-Za-z]:[\\/])/.test(filePath)) throw new ToolError('Pass an absolute path to the .apk or .aab file.');
      const lower = filePath.toLowerCase();
      if (!lower.endsWith('.apk') && !lower.endsWith('.aab')) throw new ToolError('Only .apk and .aab files can be installed.');
      const target = await resolveDevice(device);
      const options = { reinstall, allowDowngrade, grantPermissions };
      const result = lower.endsWith('.aab')
        ? await adb.installAab(target.id, filePath, options)
        : await adb.installApk(target.id, filePath, options);
      if (!result.success) {
        throw new ToolError(`Install failed: ${result.error ?? 'unknown error'}${result.errorCode ? ` (${result.errorCode})` : ''}`);
      }
      return text(`Installed ${result.packageName ?? filePath} on ${target.id}.`);
    }
  );

  tool(
    'uninstall_app',
    {
      title: 'Uninstall app',
      description: 'Uninstalls an app and deletes its data. Cannot be undone.',
      inputSchema: { app: appArg, device: deviceArg },
      destructive: true,
    },
    async ({ app, device }) => {
      const packageName = resolveApp(app);
      const target = await resolveDevice(device);
      await adb.uninstallApp(target.id, packageName);
      return text(`Uninstalled ${packageName} from ${target.id}.`);
    }
  );

  // ---------- capture ----------

  tool(
    'take_screenshot',
    {
      title: 'Take screenshot',
      description:
        'Captures the device screen and returns it as an image. The full-size PNG is saved to the captures folder (or savePath).',
      inputSchema: {
        device: deviceArg,
        savePath: z
          .string()
          .optional()
          .describe(
            'Absolute .png path for a new file. Defaults to Pictures/Android Debugger. Existing files are never overwritten; paths outside the captures folder need risky tools allowed.'
          ),
        maxDimension: z
          .number()
          .int()
          .min(320)
          .max(4096)
          .default(1280)
          .describe('Longest side of the returned image in pixels (the saved file keeps full size).'),
        includeImage: z.boolean().default(true).describe('Return the image itself, not just the saved path.'),
      },
    },
    async ({ device, savePath, maxDimension, includeImage }) => {
      const outPath = savePath ? validateSavePath(savePath, '.png') : undefined;
      const target = await resolveDevice(device);
      const saved = await host.captureScreenshot(target.id, deviceLabel(target), outPath);
      if (!includeImage) return text(`Saved a screenshot of ${target.id} to ${saved.path}.`);
      const image = host.encodeImage(saved.path, maxDimension);
      const scaled =
        image.width !== image.originalWidth
          ? ` Returned at ${image.width}x${image.height}; multiply coordinates by ${(image.originalWidth / image.width).toFixed(3)} for input_tap.`
          : '';
      return {
        content: [
          { type: 'image', data: image.data, mimeType: image.mimeType },
          {
            type: 'text',
            text: `Screenshot of ${target.id} (${image.originalWidth}x${image.originalHeight}) saved to ${saved.path}.${scaled}`,
          },
        ],
      };
    }
  );

  tool(
    'start_screen_recording',
    {
      title: 'Start screen recording',
      description:
        'Starts recording the device screen (Android limits a recording to 3 minutes). Call stop_screen_recording to save it.',
      inputSchema: {
        device: deviceArg,
        savePath: z
          .string()
          .optional()
          .describe(
            'Absolute .mp4 path for a new file. Defaults to Pictures/Android Debugger. Existing files are never overwritten; paths outside the captures folder need risky tools allowed.'
          ),
      },
    },
    async ({ device, savePath }) => {
      const outPath = savePath ? validateSavePath(savePath, '.mp4') : undefined;
      const target = await resolveDevice(device);
      const state = adb.getRecordingState();
      if (state.isRecording) {
        throw new ToolError(`A recording is already running on ${state.deviceId ?? 'a device'}. Call stop_screen_recording first.`);
      }
      const result = await host.startRecording(target.id, deviceLabel(target), outPath);
      if (!result.success) throw new ToolError('Screen recording could not start.');
      return text(`Recording ${target.id}. It will be saved to ${result.path ?? host.capturesDir()} when you call stop_screen_recording.`);
    }
  );

  tool(
    'stop_screen_recording',
    {
      title: 'Stop screen recording',
      description: 'Stops the running screen recording and saves the .mp4 file.',
      inputSchema: {},
    },
    async () => {
      const state = adb.getRecordingState();
      if (!state.isRecording || !state.deviceId) throw new ToolError('No screen recording is running.');
      const result = await host.stopRecording(state.deviceId);
      if (!result.success) throw new ToolError('The recording could not be saved.');
      return text(`Saved the recording to ${result.path}.`);
    }
  );

  // ---------- logs & crashes ----------

  tool(
    'get_logs',
    {
      title: 'Get logs',
      description:
        'Reads logcat lines, newest last. Uses the live stream Android Debugger already collects when it matches the request, ' +
        'otherwise reads what is still in the device\'s log buffer.',
      inputSchema: {
        device: deviceArg,
        app: appArg,
        mode: z
          .enum(['app', 'rn', 'device'])
          .optional()
          .describe('"app" = only the app\'s process, "rn" = React Native JS tags, "device" = everything. Default: "app" when an app is selected, else "device".'),
        minLevel: z.enum(['V', 'D', 'I', 'W', 'E', 'F']).default('V').describe('Lowest level: V, D, I, W, E or F.'),
        tags: z.array(z.string()).optional().describe('Only these tags (exact, case-insensitive).'),
        excludeTags: z.array(z.string()).optional().describe('Drop these tags.'),
        search: z.string().optional().describe('Text to find in the message or tag.'),
        regex: z.boolean().default(false).describe('Treat search as a case-insensitive regular expression.'),
        since: sinceArg,
        limit: z.number().int().min(1).max(2000).default(200).describe('Maximum lines returned (the newest ones).'),
        source: z
          .enum(['auto', 'live', 'device-buffer'])
          .default('auto')
          .describe('"live" = only the stream Android Debugger collected, "device-buffer" = read the device log now.'),
      },
      readOnly: true,
    },
    async ({ device, app, mode, minLevel, tags, excludeTags, search, regex, since, limit, source }) => {
      const target = await resolveDevice(device);
      const selectionApp = app?.trim() || host.getSelection().packageName;
      const effectiveMode: LogStreamMode = mode ?? (selectionApp ? 'app' : 'device');
      const packageName = effectiveMode === 'app' ? resolveApp(app) : '';
      const sinceEpochMs = parseSince(since);

      const live = store.getLiveLogs();
      const liveMatches =
        live.target !== null &&
        live.target.deviceId === target.id &&
        live.target.mode === effectiveMode &&
        live.target.packageName === packageName &&
        live.lines.length > 0;

      const query = {
        minLevel: minLevel as LogLevel,
        tags,
        excludeTags,
        search,
        regex,
        sinceEpochMs,
        limit,
      };

      let result: ReturnType<typeof queryLogLines> | null = null;
      let origin = '';
      if (source === 'live' && !liveMatches) {
        const what = live.target
          ? `it is showing ${live.target.mode} logs for ${live.target.packageName || live.target.deviceId}`
          : 'it has not collected any logs yet';
        throw new ToolError(
          `The live log stream doesn't match this request (${what}). Use source "device-buffer", or select the device/app first.`
        );
      }
      if (liveMatches && source !== 'device-buffer') {
        const liveResult = queryLogLines(live.lines, query);
        // "auto" only answers from the live stream when it reaches back far enough;
        // otherwise the device's own buffer usually holds more history.
        // A stopped or ended stream is missing everything logged since, so
        // "auto" only trusts it while it is still running.
        const running = live.state === 'streaming' || live.state === 'starting';
        const firstEpoch = live.lines[0]?.epochMs ?? 0;
        const covers =
          running &&
          (sinceEpochMs !== null ? firstEpoch > 0 && firstEpoch <= sinceEpochMs : liveResult.matched >= limit);
        if (source === 'live' || covers) {
          result = liveResult;
          origin = `live stream (${live.state === 'idle' ? 'stopped' : live.state}, ${live.lines.length} lines buffered)`;
        }
      }
      if (!result) {
        const history = await adb.loadLogHistory({
          deviceId: target.id,
          mode: effectiveMode,
          packageName: packageName || undefined,
          limit: 5000,
        });
        if (history.error) throw new ToolError(history.error);
        result = queryLogLines(history.entries, query);
        origin = `device log buffer (${history.entries.length} lines read)`;
      }

      const header =
        `${result.lines.length} of ${result.matched} matching lines from the ${origin}; ` +
        `${effectiveMode} logs on ${target.id}${packageName ? ` for ${packageName}` : ''}.`;
      if (result.lines.length === 0) {
        return text(`${header}\nNo lines matched. Try a lower minLevel, a wider "since", or mode "device".`);
      }
      return text(`${header}\n\n${result.lines.map(formatLogLineForMcp).join('\n')}`);
    }
  );

  tool(
    'clear_logs',
    {
      title: 'Clear logs',
      description: 'Clears the device\'s logcat buffer and the logs Android Debugger collected for MCP.',
      inputSchema: { device: deviceArg },
    },
    async ({ device }) => {
      const target = await resolveDevice(device);
      await adb.clearLogcat(target.id);
      store.clearLogs();
      return text(`Cleared the log buffer on ${target.id}. The Logs panel keeps the lines it already shows.`);
    }
  );

  tool(
    'get_crashes',
    {
      title: 'Get crashes',
      description:
        'Recent app crashes (Java exceptions and native signals) with stack traces, from the crash stream Android Debugger watches. ' +
        'Falls back to the device crash buffer when none were captured live.',
      inputSchema: {
        device: deviceArg,
        app: z.string().optional().describe('Only crashes of this package (process name).'),
        since: sinceArg,
        limit: z.number().int().min(1).max(200).default(20),
        includeRaw: z.boolean().default(false).describe('Include the raw logcat text of each crash.'),
      },
      readOnly: true,
    },
    async ({ device, app, since, limit, includeRaw }) => {
      const target = await resolveDevice(device);
      const sinceEpochMs = parseSince(since);
      const crashes = store.crashes
        .toArray()
        .filter((crash) => crash.deviceId === target.id)
        .filter((crash) => !app || crash.entry.processName.includes(app))
        .filter((crash) => sinceEpochMs === null || crash.receivedAt >= sinceEpochMs)
        .slice(-limit);
      if (crashes.length > 0) {
        return json(
          crashes.map(({ entry, receivedAt }) => ({
            time: entry.timestamp,
            receivedAt: new Date(receivedAt).toISOString(),
            process: entry.processName,
            pid: entry.pid,
            signal: entry.signal,
            message: entry.message,
            stackTrace: entry.stackTrace.slice(0, 60),
            raw: includeRaw ? truncateText(entry.raw, 20_000) : undefined,
          })),
          `${crashes.length} crash(es) captured live on ${target.id}.`
        );
      }
      const dump = (await adb.dumpCrashBuffer(target.id, 400)).trim();
      const watching = store.getCrashStreamDevice() === target.id;
      const lines = dump.split('\n').filter((line) => line && !line.startsWith('---------'));
      const filtered = app ? lines.filter((line) => line.includes(app)) : lines;
      if (dump === '' || lines.length === 0 || (app && filtered.length === 0)) {
        return text(
          `No crashes found on ${target.id}${app ? ` for ${app}` : ''}.` +
            (watching ? ' Android Debugger is watching for new ones.' : '')
        );
      }
      return text(
        `No crashes were captured live${watching ? '' : ' (the crash stream is not running for this device)'}; ` +
          `these are the last lines of the device crash buffer:\n\n${truncateText(dump, 30_000)}`
      );
    }
  );

  // ---------- SDK data ----------

  function sdkHeader(): string {
    const { target, active } = store.getSdkStatus();
    if (!target) {
      return 'Android Debugger is not reading SDK messages yet (select a device and app in the app).';
    }
    const bridge = host.getSdkBridgeStatus();
    const apps = bridge.clients.map((client) => `SDK ${client.sdkVersion}`).join(', ');
    const connection =
      bridge.clients.length > 0
        ? ` ${bridge.clients.length} app(s) connected (${apps}).`
        : bridge.state === 'error'
          ? ` No app connected: ${bridge.error}.`
          : active
            ? ' No app connected over the SDK socket right now (SDK 1.x apps report through logcat instead).'
            : '';
    return `SDK stream ${active ? 'active' : 'stopped'} for ${target.packageName || 'all apps'} on ${target.deviceId}.${connection}`;
  }

  const SDK_EMPTY_HINT =
    'Nothing received yet. The app must include @yemirhan/android-debugger-sdk (AndroidDebugger.init() at startup) ' +
    'and run on the device selected in Android Debugger, which forwards the SDK port with adb reverse. ' +
    'Release builds also need cleartext traffic to localhost allowed.';

  tool(
    'get_network_requests',
    {
      title: 'Get network requests',
      description:
        'HTTP requests captured by the Android Debugger SDK in the app (fetch/XHR/axios), newest last. Bodies are optional and truncated.',
      inputSchema: {
        urlContains: z.string().optional().describe('Substring of the URL.'),
        method: z.string().optional().describe('HTTP method, e.g. GET.'),
        status: z
          .union([z.enum(['failed', 'ok', 'pending']), z.number().int()])
          .optional()
          .describe('"failed" (error or 4xx/5xx), "ok", "pending", or an exact status code.'),
        since: sinceArg,
        limit: z.number().int().min(1).max(500).default(50),
        includeBodies: z.boolean().default(false).describe('Include headers and bodies.'),
        maxBodyChars: z.number().int().min(100).max(100_000).default(2000),
      },
      readOnly: true,
    },
    async ({ urlContains, method, status, since, limit, includeBodies, maxBodyChars }) => {
      const all = store.network.values();
      if (all.length === 0) return text(`${sdkHeader()}\n${SDK_EMPTY_HINT}`);
      const result = queryNetworkRequests(all, {
        urlContains,
        method,
        status,
        sinceEpochMs: parseSince(since),
        limit,
        includeBodies,
        maxBodyChars,
      });
      return json(result.requests, `${sdkHeader()} ${result.requests.length} of ${result.matched} matching requests.`);
    }
  );

  tool(
    'get_console_logs',
    {
      title: 'Get console logs',
      description: 'console.log/info/warn/error/debug calls captured by the Android Debugger SDK in the app, newest last.',
      inputSchema: {
        level: z.enum(['log', 'info', 'warn', 'error', 'debug']).optional().describe('Only this level.'),
        search: z.string().optional().describe('Case-insensitive text to find.'),
        since: sinceArg,
        limit: z.number().int().min(1).max(1000).default(200),
        maxMessageChars: z.number().int().min(100).max(50_000).default(4000),
      },
      readOnly: true,
    },
    async ({ level, search, since, limit, maxMessageChars }) => {
      const all = store.console.toArray();
      if (all.length === 0) return text(`${sdkHeader()}\n${SDK_EMPTY_HINT}`);
      const sinceEpochMs = parseSince(since);
      const needle = search?.toLowerCase();
      const matched = all.filter(
        (line) =>
          (!level || line.level === level) &&
          (!needle || line.message.toLowerCase().includes(needle)) &&
          (sinceEpochMs === null || line.timestamp >= sinceEpochMs)
      );
      const lines = matched
        .slice(-limit)
        .map((line) => `${new Date(line.timestamp).toISOString()} ${line.level.toUpperCase()} ${truncateText(line.message, maxMessageChars)}`);
      return text(`${sdkHeader()} ${lines.length} of ${matched.length} matching console lines.\n\n${lines.join('\n') || '(none)'}`);
    }
  );

  tool(
    'get_websocket_messages',
    {
      title: 'Get WebSocket messages',
      description: 'WebSocket connections, messages and events captured by the Android Debugger SDK in the app.',
      inputSchema: {
        connectionId: z.string().optional().describe('Only this connection (see the connections list).'),
        direction: z.enum(['sent', 'received']).optional(),
        search: z.string().optional().describe('Case-insensitive text to find in message data.'),
        limit: z.number().int().min(1).max(1000).default(100),
        maxDataChars: z.number().int().min(50).max(50_000).default(1000),
      },
      readOnly: true,
    },
    async ({ connectionId, direction, search, limit, maxDataChars }) => {
      const connections = store.wsConnections.values();
      const messages = store.wsMessages.toArray();
      if (connections.length === 0 && messages.length === 0) return text(`${sdkHeader()}\n${SDK_EMPTY_HINT}`);
      const needle = search?.toLowerCase();
      const matched = messages.filter(
        (message) =>
          (!connectionId || message.connectionId === connectionId) &&
          (!direction || message.direction === direction) &&
          (!needle || message.data.toLowerCase().includes(needle))
      );
      const events = store.wsEvents
        .toArray()
        .filter((event) => !connectionId || event.connectionId === connectionId)
        .slice(-50)
        .map((event) => ({ connectionId: event.connectionId, event: event.event, time: new Date(event.timestamp).toISOString(), error: event.error }));
      return json(
        {
          connections: connections.map((connection) => ({
            id: connection.id,
            url: connection.url,
            state: ['connecting', 'open', 'closing', 'closed'][connection.readyState] ?? String(connection.readyState),
            openedAt: connection.openedAt ? new Date(connection.openedAt).toISOString() : undefined,
            closedAt: connection.closedAt ? new Date(connection.closedAt).toISOString() : undefined,
          })),
          messages: matched.slice(-limit).map((message) => ({
            connectionId: message.connectionId,
            direction: message.direction,
            type: message.type,
            size: message.size,
            time: new Date(message.timestamp).toISOString(),
            data: truncateText(message.data, maxDataChars),
          })),
          recentEvents: events,
        },
        `${sdkHeader()} ${Math.min(limit, matched.length)} of ${matched.length} matching messages.`
      );
    }
  );

  tool(
    'get_state_snapshots',
    {
      title: 'Get state snapshots',
      description: 'Latest Redux/Zustand/custom state snapshots the Android Debugger SDK reported from the app.',
      inputSchema: {
        name: z.string().optional().describe('Only stores whose name contains this text.'),
        includeState: z.boolean().default(true).describe('Include the state itself, not only store names.'),
        maxChars: z.number().int().min(200).max(200_000).default(20_000).describe('Truncate each state after this many characters.'),
      },
      readOnly: true,
    },
    async ({ name, includeState, maxChars }) => {
      const states = store.states.values();
      if (states.length === 0) return text(`${sdkHeader()}\n${SDK_EMPTY_HINT} State needs the Redux middleware or Zustand integration.`);
      const needle = name?.toLowerCase();
      const matched = states.filter((state) => !needle || state.name.toLowerCase().includes(needle));
      return json(
        matched.map((state) => {
          let serialized: string | undefined;
          if (includeState) {
            try {
              serialized = truncateText(JSON.stringify(state.state, null, 2) ?? 'undefined', maxChars);
            } catch {
              serialized = String(state.state);
            }
          }
          return {
            name: state.name,
            source: state.source,
            updatedAt: new Date(state.timestamp).toISOString(),
            state: serialized,
          };
        }),
        `${sdkHeader()} ${matched.length} store(s).`
      );
    }
  );

  // ---------- performance & app state ----------

  tool(
    'get_performance',
    {
      title: 'Get performance',
      description:
        'Current memory (KB), CPU (%), frame rate and battery for an app, plus min/max/average over the recent history ' +
        'Android Debugger collected in the background.',
      inputSchema: {
        app: appArg,
        device: deviceArg,
        historySeconds: z.number().int().min(5).max(3600).default(60).describe('How far back the summary looks.'),
      },
      readOnly: true,
    },
    async ({ app, device, historySeconds }) => {
      const target = await resolveDevice(device);
      const packageName = resolveApp(app);
      const now = Date.now();
      const windowStart = now - historySeconds * 1000;
      const FRESH_MS = 15_000;

      const recent = (kind: 'memory' | 'cpu' | 'fps' | 'battery') =>
        store.getMonitorSamples(kind, target.id, packageName).filter((sample) => sample.receivedAt >= windowStart);
      const latestFresh = <T,>(samples: MonitorSample[]): T | null => {
        const last = samples[samples.length - 1];
        return last && now - last.receivedAt <= FRESH_MS ? (last.payload as T) : null;
      };

      const memorySamples = recent('memory');
      const cpuSamples = recent('cpu');
      const fpsSamples = recent('fps');
      const batterySamples = recent('battery');

      type Mem = { totalPss: number; javaHeap: number; nativeHeap: number; graphics: number; code: number; stack: number; system: number; other: number };
      type Cpu = { usage: number };
      type Fps = { fps: number; jankyFrames: number; totalFrames: number; percentile90: number; percentile95: number; percentile99: number };
      type Battery = { level: number; temperature: number; status: string; health: string; plugged: string; voltage: number };

      const [memory, cpu, fps, battery] = await Promise.all([
        latestFresh<Mem>(memorySamples) ?? adb.getMemInfo(target.id, packageName).catch(() => null),
        latestFresh<Cpu>(cpuSamples) ?? adb.getCpuInfo(target.id, packageName).catch(() => null),
        latestFresh<Fps>(fpsSamples) ?? adb.getFpsInfo(target.id, packageName).catch(() => null),
        latestFresh<Battery>(batterySamples) ?? adb.getBatteryInfo(target.id).catch(() => null),
      ]);

      const series = <T,>(samples: MonitorSample[], pick: (payload: T) => number) =>
        summarizeSeries(samples.map((sample) => pick(sample.payload as T)));
      const history = {
        windowSeconds: historySeconds,
        memoryTotalPssKb: series<Mem>(memorySamples, (payload) => payload.totalPss),
        cpuPercent: series<Cpu>(cpuSamples, (payload) => payload.usage),
        fps: series<Fps>(fpsSamples, (payload) => payload.fps),
        jankyFramePercent: series<Fps>(fpsSamples, (payload) =>
          payload.totalFrames > 0 ? (payload.jankyFrames / payload.totalFrames) * 100 : NaN
        ),
        batteryLevel: series<Battery>(batterySamples, (payload) => payload.level),
      };
      const hasHistory = [memorySamples, cpuSamples, fpsSamples, batterySamples].some((samples) => samples.length > 0);

      return json(
        {
          device: target.id,
          app: packageName,
          current: {
            memoryKb: memory
              ? {
                  totalPss: memory.totalPss,
                  javaHeap: memory.javaHeap,
                  nativeHeap: memory.nativeHeap,
                  graphics: memory.graphics,
                  code: memory.code,
                  stack: memory.stack,
                  system: memory.system,
                  other: memory.other,
                }
              : null,
            cpuPercent: cpu?.usage ?? null,
            frames: fps
              ? {
                  fps: fps.fps,
                  jankyFrames: fps.jankyFrames,
                  totalFrames: fps.totalFrames,
                  p90Ms: fps.percentile90,
                  p95Ms: fps.percentile95,
                  p99Ms: fps.percentile99,
                }
              : null,
            battery: battery
              ? {
                  level: battery.level,
                  temperatureC: battery.temperature,
                  status: battery.status,
                  health: battery.health,
                  plugged: battery.plugged,
                  voltageMv: battery.voltage,
                }
              : null,
          },
          history: hasHistory ? history : null,
        },
        memory === null && cpu === null
          ? `${packageName} does not seem to be running on ${target.id}; launch_app starts it.`
          : hasHistory
            ? undefined
            : 'No background history for this app yet (monitoring may be off in Settings or just started); current values were read now.'
      );
    }
  );

  tool(
    'get_threads',
    {
      title: 'Get threads',
      description: 'Threads of a running app with their state, total CPU time (seconds) and priority, busiest first.',
      inputSchema: {
        app: appArg,
        device: deviceArg,
        state: z.enum(['running', 'sleeping', 'waiting', 'blocked', 'zombie', 'stopped', 'unknown']).optional(),
        limit: z.number().int().min(1).max(500).default(60),
      },
      readOnly: true,
    },
    async ({ app, device, state, limit }) => {
      const target = await resolveDevice(device);
      const packageName = resolveApp(app);
      const snapshot = await adb.getThreads(target.id, packageName);
      if (!snapshot) throw new ToolError(`${packageName} is not running on ${target.id}. Start it with launch_app.`);
      const threads = snapshot.threads
        .filter((thread) => !state || thread.state === state)
        .sort((a, b) => b.cpuTime - a.cpuTime);
      const counts: Record<string, number> = {};
      for (const thread of snapshot.threads) counts[thread.state] = (counts[thread.state] ?? 0) + 1;
      return json({
        app: packageName,
        total: snapshot.threads.length,
        byState: counts,
        threads: threads.slice(0, limit).map((thread) => ({
          tid: thread.id,
          name: thread.name,
          state: thread.state,
          cpuTimeSeconds: thread.cpuTime,
          priority: thread.priority,
        })),
      });
    }
  );

  tool(
    'get_activity_stack',
    {
      title: 'Get activity stack',
      description: 'The app\'s tasks and activities (resumed/paused/stopped) and the focused activity.',
      inputSchema: { app: appArg, device: deviceArg },
      readOnly: true,
    },
    async ({ app, device }) => {
      const target = await resolveDevice(device);
      const packageName = resolveApp(app);
      const stack = await adb.getActivityStack(target.id, packageName);
      if (!stack) throw new ToolError(`Could not read the activity stack of ${packageName}.`);
      if (stack.tasks.length === 0) return json(stack, `${packageName} has no activities right now (is it running?).`);
      return json(stack);
    }
  );

  // ---------- intents & input ----------

  tool(
    'open_deep_link',
    {
      title: 'Open deep link',
      description: 'Opens a URL or deep link (e.g. myapp://profile/42) on the device with an ACTION_VIEW intent.',
      inputSchema: { url: z.string().min(3).describe('The link, including its scheme.'), device: deviceArg },
    },
    async ({ url, device }) => {
      const value = url.trim();
      if (/\s/.test(value)) throw new ToolError('Links cannot contain spaces; percent-encode them.');
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) throw new ToolError('Start the link with a scheme, e.g. myapp:// or https://.');
      const target = await resolveDevice(device);
      const result = await adb.fireDeepLink(target.id, value);
      if (!result.success) throw new ToolError(result.error || 'No app on the device handled this link.');
      return text(`Opened ${value} on ${target.id}.`);
    }
  );

  tool(
    'send_intent',
    {
      title: 'Send intent',
      description: 'Starts an activity with a custom intent (am start): action, data, type, category, component, extras and flags.',
      inputSchema: {
        device: deviceArg,
        action: z.string().optional().describe('e.g. android.intent.action.VIEW'),
        data: z.string().optional().describe('Data URI.'),
        mimeType: z.string().optional(),
        category: z.string().optional(),
        component: z.string().optional().describe('package/.Activity, e.g. com.example/.MainActivity'),
        extras: z
          .array(
            z.object({
              key: z.string().min(1),
              type: z.enum(['string', 'int', 'long', 'float', 'boolean', 'uri']),
              value: z.string(),
            })
          )
          .default([]),
        flags: z.array(z.string()).default([]).describe('Intent flags, e.g. 0x10000000.'),
      },
    },
    async ({ device, action, data, mimeType, category, component, extras, flags }) => {
      if (!action && !data && !component) throw new ToolError('Pass at least an action, data URI or component.');
      const target = await resolveDevice(device);
      const now = Date.now();
      const intent: IntentConfig = {
        id: `mcp-${now}`,
        name: 'MCP intent',
        action: action ?? '',
        data,
        type: mimeType,
        category,
        component,
        extras,
        flags,
        createdAt: now,
        updatedAt: now,
      };
      const result = await adb.fireIntent(target.id, intent);
      if (!result.success) throw new ToolError(result.error || 'The intent was not delivered.');
      return text(`Sent the intent on ${target.id}.`);
    }
  );

  tool(
    'input_tap',
    {
      title: 'Tap',
      description: 'Taps the screen at device pixel coordinates (see get_device_info for the screen size).',
      inputSchema: { x: z.number().min(0), y: z.number().min(0), device: deviceArg },
    },
    async ({ x, y, device }) => {
      const target = await resolveDevice(device);
      await adb.inputTap(target.id, x, y);
      return text(`Tapped (${Math.round(x)}, ${Math.round(y)}) on ${target.id}.`);
    }
  );

  tool(
    'input_swipe',
    {
      title: 'Swipe',
      description: 'Swipes from (x1, y1) to (x2, y2) in device pixels. Use a long duration for a drag or long press.',
      inputSchema: {
        x1: z.number().min(0),
        y1: z.number().min(0),
        x2: z.number().min(0),
        y2: z.number().min(0),
        durationMs: z.number().int().min(1).max(10_000).default(300),
        device: deviceArg,
      },
    },
    async ({ x1, y1, x2, y2, durationMs, device }) => {
      const target = await resolveDevice(device);
      await adb.inputSwipe(target.id, x1, y1, x2, y2, durationMs);
      return text(`Swiped on ${target.id}.`);
    }
  );

  tool(
    'input_text',
    {
      title: 'Type text',
      description: 'Types ASCII text into the focused field. Use press_key ENTER to submit.',
      inputSchema: { text: z.string().min(1).max(1000), device: deviceArg },
    },
    async ({ text: value, device }) => {
      const target = await resolveDevice(device);
      await adb.inputText(target.id, value);
      return text(`Typed ${value.length} characters on ${target.id}.`);
    }
  );

  tool(
    'press_key',
    {
      title: 'Press key',
      description:
        'Presses a key: a name such as HOME, BACK, ENTER, APP_SWITCH, MENU, DEL, TAB, VOLUME_UP, POWER, DPAD_DOWN, or a numeric key code.',
      inputSchema: {
        key: z.union([z.string().min(1), z.number().int().min(0).max(400)]),
        longPress: z.boolean().default(false),
        device: deviceArg,
      },
    },
    async ({ key, longPress, device }) => {
      const target = await resolveDevice(device);
      await adb.pressKey(target.id, key, longPress);
      return text(`Pressed ${typeof key === 'number' ? `key code ${key}` : key.toUpperCase()}${longPress ? ' (long press)' : ''} on ${target.id}.`);
    }
  );

  tool(
    'set_dev_option',
    {
      title: 'Set developer option',
      description:
        'Changes a developer option: layout_bounds, show_touches, pointer_location (use "enabled"), or animation_scale (use "scale"; 0 turns animations off).',
      inputSchema: {
        option: z.enum(['layout_bounds', 'show_touches', 'pointer_location', 'animation_scale']),
        enabled: z.boolean().optional().describe('For layout_bounds, show_touches and pointer_location.'),
        scale: z
          .number()
          .min(0)
          .max(10)
          .optional()
          .describe('For animation_scale: 0 (off), 0.5, 1 (normal), 1.5, 2, 5 or 10.'),
        animation: z
          .enum(['all', 'window', 'transition', 'animator'])
          .default('all')
          .describe('Which animation scale to change (default all three).'),
        device: deviceArg,
      },
    },
    async ({ option, enabled, scale, animation, device }) => {
      const target = await resolveDevice(device);
      let ok: boolean;
      if (option === 'animation_scale') {
        if (scale === undefined) throw new ToolError('Pass "scale" (e.g. 0 to turn animations off, 1 for normal).');
        const types = animation === 'all' ? (['window', 'transition', 'animator'] as const) : ([animation] as const);
        const results = await Promise.all(types.map((type) => adb.setAnimationScale(target.id, scale, type)));
        ok = results.every(Boolean);
      } else {
        if (enabled === undefined) throw new ToolError('Pass "enabled": true or false.');
        const setter = {
          layout_bounds: adb.setLayoutBounds,
          show_touches: adb.setShowTouches,
          pointer_location: adb.setPointerLocation,
        }[option];
        ok = await setter.call(adb, target.id, enabled);
      }
      if (!ok) throw new ToolError(`The device refused to change ${option.replace(/_/g, ' ')}.`);
      const options = await adb.getDeveloperOptions(target.id).catch(() => null);
      return json(options, `Updated ${option.replace(/_/g, ' ')} on ${target.id}. Current developer options:`);
    }
  );

  // ---------- React Native ----------

  tool(
    'reload_react_native',
    {
      title: 'Reload React Native',
      description:
        'Reloads the JS bundle of the React Native debug app in the foreground (double-R key). ' +
        'Pass metroPort to reload every app connected to that Metro server instead.',
      inputSchema: {
        device: deviceArg,
        metroPort: z.number().int().min(1).max(65535).optional().describe('Metro port, e.g. 8081, to reload through Metro.'),
      },
    },
    async ({ device, metroPort }) => {
      if (metroPort) {
        const result = await host.sendMetroCommand(metroPort, 'reload');
        if (!result.ok) throw new ToolError(result.error ?? 'Metro did not accept the reload.');
        return text(`Asked Metro on port ${metroPort} to reload connected apps.`);
      }
      const target = await resolveDevice(device);
      await adb.sendKeyEvents(target.id, [46, 46]);
      return text(`Sent reload (R, R) to the foreground app on ${target.id}. Only React Native debug builds respond.`);
    }
  );

  tool(
    'open_dev_menu',
    {
      title: 'Open React Native dev menu',
      description: 'Opens the React Native dev menu in the foreground debug app. Pass metroPort to use Metro instead of a key press.',
      inputSchema: {
        device: deviceArg,
        metroPort: z.number().int().min(1).max(65535).optional(),
      },
    },
    async ({ device, metroPort }) => {
      if (metroPort) {
        const result = await host.sendMetroCommand(metroPort, 'devMenu');
        if (!result.ok) throw new ToolError(result.error ?? 'Metro did not open the dev menu.');
        return text(`Asked Metro on port ${metroPort} to open the dev menu.`);
      }
      const target = await resolveDevice(device);
      const result = await host.openDevMenuViaAdb(target.id);
      if (!result.ok) throw new ToolError(result.error ?? 'Could not open the dev menu.');
      return text(`Opened the dev menu on ${target.id} (React Native debug builds only).`);
    }
  );

  // ---------- desktop app ----------

  tool(
    'navigate_ui',
    {
      title: 'Show a tab in Android Debugger',
      description: 'Switches the Android Debugger window to a tab and brings it to the front, e.g. to show the user logs or a chart.',
      inputSchema: {
        tab: z.enum(APP_TABS).describe('Tab to show.'),
        section: z.enum(['mcp']).optional().describe('Scroll to a section: "mcp" = Settings → AI assistants.'),
      },
    },
    async ({ tab, section }) => {
      host.navigate(tab, section);
      return text(`Showing the ${tab} tab${section ? ` (${section} section)` : ''} in Android Debugger.`);
    }
  );

  // ---------- emulators (AVDs) ----------

  function emulatorSummary(avd: AvdInfo) {
    return {
      name: avd.name,
      displayName: avd.displayName,
      state: avd.state,
      serial: avd.serial,
      androidVersion: avd.androidVersion,
      apiLevel: avd.apiLevel,
      abi: avd.abi,
      systemImage: avd.systemImage,
      playStore: avd.playStore,
      deviceProfile: avd.deviceProfile,
      ramMb: avd.ramMb,
      boot: avd.boot
        ? { phase: avd.boot.phase, message: avd.boot.message, error: avd.boot.error, warning: avd.boot.warning }
        : undefined,
      problem: avd.problem ?? undefined,
    };
  }

  const emulatorName = z.string().min(1).describe('AVD name from list_emulators, e.g. Pixel_8_API_36.');

  tool(
    'list_emulators',
    {
      title: 'List emulators',
      description:
        'Lists the Android emulators (AVDs) on this computer: whether each is stopped, booting or running (with its adb serial), ' +
        'its Android version and system image, plus the installed system images and any Android SDK setup problems.',
      inputSchema: {},
      readOnly: true,
    },
    async () => {
      const { setup, avds } = await host.emulators.listAvds();
      const images = await host.emulators.listSystemImages(setup);
      return json({
        emulators: avds.map(emulatorSummary),
        installedSystemImages: images.map((image) => ({
          id: image.id,
          androidVersion: image.androidVersion,
          apiLevel: image.apiLevel,
          variant: image.tagDisplay,
          abi: image.abi,
        })),
        canStart: setup.canStart,
        canCreate: setup.canCreate,
        setupProblems: setup.issues.length ? setup.issues.map((issue) => `${issue.title}. ${issue.detail}`) : undefined,
        hint: avds.length ? undefined : setup.canCreate ? 'No emulators yet. create_emulator makes one.' : undefined,
      });
    }
  );

  tool(
    'start_emulator',
    {
      title: 'Start emulator',
      description:
        'Boots an Android emulator (AVD). It keeps running after Android Debugger quits. Returns right away unless waitForBoot is true; ' +
        'booting usually takes 20-90 s. When it is ready it shows up in list_devices as emulator-<port>. ' +
        'wipeData resets it to factory state and needs "Allow risky tools".',
      inputSchema: {
        name: emulatorName,
        coldBoot: z.boolean().default(false).describe('Boot from scratch instead of the quick-boot snapshot.'),
        headless: z.boolean().default(false).describe('Run without a window.'),
        noAudio: z.boolean().default(false).describe('Disable audio.'),
        wipeData: z.boolean().default(false).describe('Erase all user data first (risky).'),
        waitForBoot: z
          .boolean()
          .default(false)
          .describe('Wait (up to about 50 s, so MCP clients do not time out) until Android has finished booting.'),
      },
    },
    async ({ name, coldBoot, headless, noAudio, wipeData, waitForBoot }) => {
      if (wipeData && !host.isRiskyAllowed()) return riskyRefusal('Starting with wipeData erases the emulator and is a risky action, which is turned off.');
      const started = await host.emulators.startAvd(name, { coldBoot, headless, noAudio, wipeData });
      if (!waitForBoot) {
        return json(
          { name, phase: started.phase, message: started.message },
          `Starting ${name}. Call list_emulators (or list_devices) to see when it is running, then select_device with its serial.`
        );
      }
      const result = await host.emulators.waitForBoot(name, 50_000);
      if (result?.phase === 'ready') {
        return json(
          { name, phase: result.phase, serial: result.serial },
          `${name} is ready as ${result.serial}. Call select_device with "${result.serial}" to work with it.`
        );
      }
      if (result?.phase === 'failed') return failure(`${name} did not start: ${result.error ?? result.message}`);
      return json(
        { name, phase: result?.phase ?? 'booting', serial: result?.serial ?? null, message: result?.message },
        `${name} is still booting${result?.warning ? ` (${result.warning})` : ''}. Call list_emulators again in a little while.`
      );
    }
  );

  tool(
    'stop_emulator',
    {
      title: 'Stop emulator',
      description: 'Shuts down a running emulator (like closing its window; the quick-boot snapshot is saved as usual).',
      inputSchema: { name: emulatorName },
    },
    async ({ name }) => {
      await host.emulators.stopAvd(name);
      return text(`Stopped ${name}.`);
    }
  );

  tool(
    'create_emulator',
    {
      title: 'Create emulator',
      description:
        'Creates an Android emulator (AVD) from an installed system image (see installedSystemImages in list_emulators). ' +
        'Does not download anything and does not start it; call start_emulator next.',
      inputSchema: {
        name: z
          .string()
          .regex(/^[A-Za-z0-9._-]+$/)
          .max(64)
          .optional()
          .describe('AVD name: letters, digits, dot, dash, underscore. Defaults to e.g. Pixel_8_API_36.'),
        systemImage: z
          .string()
          .optional()
          .describe('Installed system image id, e.g. system-images;android-36;google_apis_playstore;arm64-v8a. Defaults to the newest one.'),
        device: z.string().optional().describe('Device profile id, e.g. pixel_8 or medium_phone. Defaults to a recent Pixel.'),
        ramMb: z.number().int().min(512).max(65536).optional().describe('RAM in MB. Defaults to the profile\'s value.'),
        storageGb: z.number().int().min(1).max(512).optional().describe('Internal storage in GB. Defaults to the image\'s value.'),
        sdCardMb: z.number().int().min(0).max(65536).optional().describe('SD card size in MB; 0 or omitted = no SD card.'),
      },
    },
    async ({ name, systemImage, device, ramMb, storageGb, sdCardMb }) => {
      const setup = await host.emulators.getSetup();
      if (!setup.canCreate) {
        const issue = setup.issues.find((item) => item.id !== 'emulator');
        throw new ToolError(issue ? `${issue.title}. ${issue.detail}` : 'avdmanager is not available.');
      }
      const allImages = await host.emulators.listSystemImages(setup);
      const images = allImages.filter((image) => abisForHost(setup.hostAbi).includes(image.abi));
      const image = systemImage ? allImages.find((candidate) => candidate.id === systemImage) : images[0];
      if (!image) {
        throw new ToolError(
          systemImage
            ? `${systemImage} is not installed. Installed: ${allImages.map((candidate) => candidate.id).join(', ') || 'none'}.`
            : 'No system image for this computer is installed. Download one in Android Debugger → Emulators → System images.'
        );
      }
      const profiles = await host.emulators.listDeviceProfiles();
      const suitable = profiles.filter((profile) => profileCategoriesForTag(image.tagId).includes(profile.category));
      const profile = device ? profiles.find((candidate) => candidate.id === device) : defaultDeviceProfile(suitable.length ? suitable : profiles);
      if (!profile) {
        throw new ToolError(`Unknown device profile "${device}". Examples: ${suitable.slice(0, 12).map((item) => item.id).join(', ')}.`);
      }
      const existing = (await host.emulators.listAvds()).avds.map((avd) => avd.name);
      const created = await host.emulators.createAvd({
        name: name ?? suggestAvdName(profile.name, image.apiLevel, existing),
        systemImage: image.id,
        device: profile.id,
        ramMb,
        storageGb,
        sdCardMb,
      });
      return json(emulatorSummary(created), `Created ${created.name}. Call start_emulator with name "${created.name}" to boot it.`);
    }
  );

  tool(
    'delete_emulator',
    {
      title: 'Delete emulator',
      description: 'Deletes a stopped emulator (AVD) and all of its data from this computer.',
      inputSchema: { name: emulatorName },
      destructive: true,
    },
    async ({ name }) => {
      await host.emulators.deleteAvd(name);
      return text(`Deleted ${name}.`);
    }
  );

  // ---------- shell ----------

  tool(
    'run_shell',
    {
      title: 'Run shell command',
      description: 'Runs a command in the device shell (adb shell) and returns stdout, stderr and the exit code.',
      inputSchema: {
        command: z.string().min(1).max(4000).describe('e.g. "dumpsys window | grep mCurrentFocus"'),
        device: deviceArg,
        timeoutSeconds: z.number().int().min(1).max(120).default(30),
      },
      destructive: true,
    },
    async ({ command, device, timeoutSeconds }) => {
      const target = await resolveDevice(device);
      const result = await adb.runShell(target.id, command, timeoutSeconds * 1000);
      const MAX = 50_000;
      const parts = [
        `Exit code: ${result.exitCode ?? 'unknown'}${result.timedOut ? ` (timed out after ${timeoutSeconds}s)` : ''}`,
        result.stdout ? `stdout:\n${truncateText(result.stdout, MAX)}` : 'stdout: (empty)',
        result.stderr ? `stderr:\n${truncateText(result.stderr, MAX)}` : '',
      ].filter(Boolean);
      const output = parts.join('\n\n');
      return result.exitCode === 0 ? text(output) : failure(output);
    }
  );
}

export function createMcpServer(host: McpToolHost): McpServer {
  const server = new McpServer(
    { name: 'android-debugger', title: 'Android Debugger', version: host.appVersion },
    {
      instructions:
        'Controls Android devices and React Native apps through the Android Debugger desktop app. ' +
        'Start with list_devices; most tools default to the device and app selected in the app ' +
        '(change them with select_device / select_app). take_screenshot returns an image you can use to pick ' +
        'input_tap coordinates. No device? list_emulators and start_emulator boot an Android emulator. ' +
        'Risky tools (run_shell, install_app, uninstall_app, clear_app_data, delete_emulator, and start_emulator with wipeData) ' +
        'only work when the user allowed them in Settings.',
    }
  );
  registerMcpTools(server, host);
  return server;
}
