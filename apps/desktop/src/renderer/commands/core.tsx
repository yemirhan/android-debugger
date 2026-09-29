import React from 'react';
import type { Device } from '@android-debugger/shared';
import { allNavItems, navigationGroups } from '../data/navigation';
import { describeError, toast, updateToast, type ToastAction } from '../lib/toast';
import * as actions from './actions';
import * as icons from './icons';
import { registerCommands } from './registry';
import type { Availability, Command, CommandChoice, CommandContext } from './types';

// ---------- helpers ----------

function needsDevice(ctx: CommandContext): Availability {
  if (ctx.device) return true;
  if (!ctx.selectedDevice) return 'Connect a device first';
  return ctx.selectedDevice.status === 'unauthorized' ? 'Allow USB debugging on the device' : 'Device is offline';
}

function needsApp(ctx: CommandContext): Availability {
  const device = needsDevice(ctx);
  if (device !== true) return device;
  return ctx.packageName ? true : 'Choose an app first';
}

/** Runs `task` behind a loading toast that turns into success or the actual error. */
async function withToast<T>(
  pending: string,
  task: () => Promise<T>,
  success: (result: T) => { title: string; description?: string; actions?: ToastAction[] },
  failure: string
): Promise<void> {
  const id = toast.loading(pending);
  try {
    const result = await task();
    updateToast(id, { kind: 'success', description: undefined, actions: undefined, ...success(result) });
  } catch (error) {
    updateToast(id, { kind: 'error', title: failure, description: describeError(error), actions: undefined });
  }
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function fileActions(filePath: string, image: boolean): ToastAction[] {
  const api = window.electronAPI;
  const safely = (label: string, run: () => Promise<void>, done?: string): ToastAction => ({
    label,
    run: async () => {
      try {
        await run();
        if (done) toast.success(done);
      } catch (error) {
        toast.error(`${label} failed`, { description: describeError(error) });
      }
    },
  });
  return [
    safely('Show in Finder', () => api.showItemInFolder(filePath)),
    ...(image ? [safely('Copy image', () => api.writeClipboardImage(filePath), 'Image copied')] : []),
    safely('Copy path', () => api.writeClipboardText(filePath), 'Path copied'),
  ];
}

const DEEP_LINKS_KEY = 'android-debugger:recent-deep-links';

function recentDeepLinks(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEEP_LINKS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function rememberDeepLink(uri: string) {
  try {
    const next = [uri, ...recentDeepLinks().filter((value) => value !== uri)].slice(0, 8);
    localStorage.setItem(DEEP_LINKS_KEY, JSON.stringify(next));
  } catch {
    // Best-effort
  }
}

function deviceSubtitle(device: Device): string {
  const parts: string[] = [];
  if (device.status === 'device') {
    if (device.androidVersion && device.androidVersion !== 'Unknown') parts.push(`Android ${device.androidVersion}`);
  } else {
    parts.push(device.status === 'unauthorized' ? 'Unauthorized' : 'Offline');
  }
  parts.push(device.id);
  return parts.join(' · ');
}

// ---------- commands ----------

const deviceCommands: Command[] = [
  {
    id: 'device.switch',
    kind: 'choices',
    title: 'Switch device',
    keywords: ['select', 'change', 'phone', 'emulator', 'serial'],
    group: 'device',
    icon: <icons.PhoneIcon />,
    placeholder: 'Search devices…',
    emptyText: 'No devices found. Plug in a phone with USB debugging on, or start an emulator.',
    when: (ctx) => (ctx.devices.length > 0 ? true : 'No devices connected'),
    subtitle: (ctx) => (ctx.selectedDevice ? actions.deviceLabel(ctx.selectedDevice) : undefined),
    load: (ctx) =>
      ctx.devices.map(
        (device): CommandChoice => ({
          id: device.id,
          title: actions.deviceLabel(device),
          subtitle: deviceSubtitle(device),
          keywords: [device.id, device.model],
          icon: <icons.PhoneIcon />,
          badge: device.id === ctx.selectedDevice?.id ? 'Current' : undefined,
          run: (context) => context.selectDevice(device),
        })
      ),
  },
  {
    id: 'device.refresh',
    kind: 'action',
    title: 'Refresh devices',
    keywords: ['reload', 'scan', 'adb devices', 'look again'],
    group: 'device',
    icon: <icons.RefreshIcon />,
    run: (ctx) =>
      withToast('Looking for devices…', () => ctx.refreshDevices(), () => ({ title: 'Device list refreshed' }), 'Could not list devices'),
  },
  {
    id: 'device.copy-serial',
    kind: 'action',
    title: 'Copy device serial',
    keywords: ['id', 'adb -s', 'clipboard'],
    group: 'device',
    icon: <icons.CopyIcon />,
    when: (ctx) => (ctx.selectedDevice ? true : 'Connect a device first'),
    subtitle: (ctx) => ctx.selectedDevice?.id,
    run: (ctx) => {
      const serial = ctx.selectedDevice!.id;
      return withToast('Copying…', () => actions.copyText(serial), () => ({ title: 'Serial copied', description: serial }), 'Could not copy');
    },
  },
  {
    id: 'device.copy-info',
    kind: 'action',
    title: 'Copy device info',
    keywords: ['model', 'android version', 'abi', 'bug report', 'clipboard', 'specs'],
    group: 'device',
    icon: <icons.CopyIcon />,
    when: needsDevice,
    run: (ctx) =>
      withToast(
        'Reading device info…',
        async () => {
          const text = await actions.describeDevice(ctx.device!);
          await actions.copyText(text);
          return text;
        },
        (text) => ({ title: 'Device info copied', description: text.split('\n').slice(0, 2).join(', ') }),
        'Could not copy device info'
      ),
  },
];

const appCommands: Command[] = [
  {
    id: 'app.choose',
    kind: 'choices',
    title: 'Choose app',
    keywords: ['select', 'package', 'debuggable', 'target', 'switch app'],
    group: 'app',
    icon: <icons.PackageIcon />,
    placeholder: 'Search debuggable apps…',
    emptyText: 'No debuggable apps on this device. Install a debug build to inspect it.',
    when: needsDevice,
    subtitle: (ctx) => ctx.packageName || undefined,
    load: async (ctx) => {
      const packages = await actions.listDebuggableApps(ctx.device!.id);
      return packages.map(
        (pkg): CommandChoice => ({
          id: pkg,
          title: pkg,
          icon: <icons.PackageIcon />,
          badge: pkg === ctx.packageName ? 'Current' : undefined,
          run: (context) => context.selectPackage(pkg),
        })
      );
    },
  },
  {
    id: 'app.clear-selection',
    kind: 'action',
    title: 'Clear app selection',
    keywords: ['deselect', 'none', 'unselect'],
    group: 'app',
    icon: <icons.XCircleIcon />,
    hidden: (ctx) => !ctx.packageName,
    run: (ctx) => ctx.selectPackage(''),
  },
  {
    id: 'app.launch',
    kind: 'action',
    title: 'Launch app',
    keywords: ['start', 'open', 'run'],
    group: 'app',
    icon: <icons.PlayIcon />,
    when: needsApp,
    subtitle: (ctx) => ctx.packageName || undefined,
    run: ({ device, packageName }) =>
      withToast(`Launching ${packageName}…`, () => actions.launchApp(device!.id, packageName), () => ({ title: 'App launched', description: packageName }), 'Could not launch the app'),
  },
  {
    id: 'app.force-stop',
    kind: 'action',
    title: 'Force stop app',
    keywords: ['kill', 'close', 'am force-stop', 'quit'],
    group: 'app',
    icon: <icons.StopIcon />,
    when: needsApp,
    subtitle: (ctx) => ctx.packageName || undefined,
    run: ({ device, packageName }) =>
      withToast('Stopping app…', () => actions.forceStopApp(device!.id, packageName), () => ({ title: 'App stopped', description: packageName }), 'Could not stop the app'),
  },
  {
    id: 'app.restart',
    kind: 'action',
    title: 'Restart app',
    keywords: ['relaunch', 'kill and launch', 'cold start'],
    group: 'app',
    icon: <icons.RestartIcon />,
    when: needsApp,
    subtitle: (ctx) => ctx.packageName || undefined,
    run: ({ device, packageName }) =>
      withToast('Restarting app…', () => actions.restartApp(device!.id, packageName), () => ({ title: 'App restarted', description: packageName }), 'Could not restart the app'),
  },
  {
    id: 'app.clear-data',
    kind: 'confirm',
    title: 'Clear app data…',
    keywords: ['reset', 'pm clear', 'storage', 'cache', 'wipe'],
    group: 'app',
    icon: <icons.EraseIcon />,
    when: needsApp,
    subtitle: (ctx) => ctx.packageName || undefined,
    confirm: ({ packageName }) => ({
      title: `Clear all data for ${packageName}?`,
      body: 'Deletes its files, databases, preferences and accounts, and stops the app. This cannot be undone.',
      confirmLabel: 'Clear data',
    }),
    run: ({ device, packageName }) =>
      withToast('Clearing app data…', () => actions.clearAppData(device!.id, packageName), () => ({ title: 'App data cleared', description: packageName }), 'Could not clear app data'),
  },
  {
    id: 'app.uninstall',
    kind: 'confirm',
    title: 'Uninstall app…',
    keywords: ['remove', 'delete', 'adb uninstall'],
    group: 'app',
    icon: <icons.TrashIcon />,
    when: needsApp,
    subtitle: (ctx) => ctx.packageName || undefined,
    confirm: ({ packageName }) => ({
      title: `Uninstall ${packageName}?`,
      body: 'Removes the app and all of its data from the device. Reinstall it from Install app.',
      confirmLabel: 'Uninstall',
    }),
    run: (ctx) => {
      const { device, packageName } = ctx;
      return withToast(
        'Uninstalling…',
        async () => {
          await actions.uninstallApp(device!.id, packageName);
          ctx.selectPackage('');
        },
        () => ({ title: 'App uninstalled', description: packageName }),
        'Could not uninstall the app'
      );
    },
  },
  {
    id: 'app.deep-link',
    kind: 'input',
    title: 'Open deep link…',
    keywords: ['url', 'uri', 'intent', 'view', 'scheme', 'am start'],
    group: 'app',
    icon: <icons.LinkIcon />,
    placeholder: 'myapp://path or https://…',
    hint: 'Opens the link on the device with an ACTION_VIEW intent.',
    when: needsDevice,
    validate: actions.validateDeepLink,
    suggestions: () => recentDeepLinks(),
    run: ({ device }, uri) =>
      withToast(
        'Opening link…',
        async () => {
          await actions.openDeepLink(device!.id, uri);
          rememberDeepLink(uri.trim());
        },
        () => ({ title: 'Link opened', description: uri.trim() }),
        'Could not open the link'
      ),
  },
  {
    id: 'rn.reload',
    kind: 'action',
    title: 'Reload React Native app',
    keywords: ['rr', 'refresh', 'js', 'bundle', 'metro', 'hot reload'],
    group: 'app',
    icon: <icons.BoltIcon />,
    when: needsDevice,
    subtitle: () => 'Presses R twice in the foreground app',
    run: ({ device }) =>
      withToast('Reloading…', () => actions.reloadReactNative(device!.id), () => ({ title: 'Reload sent', description: 'Debug builds reload their JS bundle. Release builds ignore it.' }), 'Could not reload'),
  },
  {
    id: 'rn.dev-menu',
    kind: 'action',
    title: 'Open React Native dev menu',
    keywords: ['menu', 'shake', 'debug', 'keyevent 82', 'inspector'],
    group: 'app',
    icon: <icons.MenuIcon />,
    when: needsDevice,
    run: ({ device }) =>
      withToast('Opening dev menu…', () => actions.openReactNativeDevMenu(device!.id), () => ({ title: 'Dev menu opened' }), 'Could not open the dev menu'),
  },
];

const captureCommands: Command[] = [
  {
    id: 'capture.screenshot',
    kind: 'action',
    title: 'Take screenshot',
    keywords: ['screencap', 'capture', 'png', 'image', 'screen'],
    group: 'capture',
    icon: <icons.CameraIcon />,
    when: needsDevice,
    run: ({ device }) =>
      withToast(
        'Taking screenshot…',
        () => actions.takeScreenshot(device!),
        (filePath) => ({ title: 'Screenshot saved', description: fileName(filePath), actions: fileActions(filePath, true) }),
        'Screenshot failed'
      ),
  },
  {
    id: 'capture.record-start',
    kind: 'action',
    title: 'Start screen recording',
    keywords: ['record', 'video', 'screenrecord', 'mp4'],
    group: 'capture',
    icon: <icons.VideoIcon />,
    hidden: (ctx) => ctx.isRecording,
    when: needsDevice,
    run: ({ device }) =>
      withToast(
        'Starting recording…',
        () => actions.startRecording(device!),
        () => ({ title: 'Recording the screen', description: 'Open the command panel and choose “Stop screen recording” to save it.' }),
        'Could not start recording'
      ),
  },
  {
    id: 'capture.record-stop',
    kind: 'action',
    title: 'Stop screen recording',
    keywords: ['record', 'video', 'save', 'finish'],
    group: 'capture',
    icon: <icons.StopIcon />,
    hidden: (ctx) => !ctx.isRecording,
    run: (ctx) =>
      withToast(
        'Saving recording…',
        () => actions.stopRecording(ctx.device?.id ?? ctx.selectedDevice?.id ?? ''),
        (filePath) => ({
          title: 'Recording saved',
          description: filePath ? fileName(filePath) : undefined,
          actions: filePath ? fileActions(filePath, false) : undefined,
        }),
        'Could not save the recording'
      ),
  },
  {
    id: 'capture.mirror-start',
    kind: 'action',
    title: 'Start screen mirror',
    keywords: ['scrcpy', 'mirror', 'cast', 'control', 'window'],
    group: 'capture',
    icon: <icons.MirrorIcon />,
    hidden: (ctx) => ctx.isMirroring,
    when: needsDevice,
    run: async (ctx) => {
      const id = toast.loading('Starting screen mirror…');
      try {
        await actions.startMirror(ctx.device!.id);
        updateToast(id, { kind: 'success', title: 'Screen mirror started', description: 'It opens in its own window.' });
      } catch (error) {
        if (error instanceof actions.ScrcpyMissingError) {
          ctx.navigate('screen-mirror');
          updateToast(id, { kind: 'info', title: 'Install scrcpy to mirror the screen', description: 'Screen mirror can download it for you.' });
        } else {
          updateToast(id, { kind: 'error', title: 'Could not start screen mirror', description: describeError(error) });
        }
      }
    },
  },
  {
    id: 'capture.mirror-stop',
    kind: 'action',
    title: 'Stop screen mirror',
    keywords: ['scrcpy', 'close mirror'],
    group: 'capture',
    icon: <icons.StopIcon />,
    hidden: (ctx) => !ctx.isMirroring,
    run: () => withToast('Stopping mirror…', () => actions.stopMirror(), () => ({ title: 'Screen mirror stopped' }), 'Could not stop the mirror'),
  },
  {
    id: 'capture.open-folder',
    kind: 'action',
    title: 'Open captures folder',
    keywords: ['screenshots', 'recordings', 'finder', 'pictures'],
    group: 'capture',
    icon: <icons.FolderIcon />,
    run: async () => {
      try {
        await window.electronAPI.openCapturesFolder();
      } catch (error) {
        toast.error('Could not open the folder', { description: describeError(error) });
      }
    },
  },
];

function toggleCommand(
  id: string,
  title: string,
  keywords: string[],
  icon: React.ReactNode,
  toggle: (deviceId: string) => Promise<boolean>,
  label: string
): Command {
  return {
    id,
    kind: 'action',
    title,
    keywords,
    group: 'dev-options',
    icon,
    when: needsDevice,
    run: ({ device }) =>
      withToast(`Updating ${label.toLowerCase()}…`, () => toggle(device!.id), (on) => ({ title: `${label} ${on ? 'on' : 'off'}` }), `Could not change ${label.toLowerCase()}`),
  };
}

const devOptionCommands: Command[] = [
  toggleCommand('dev.layout-bounds', 'Toggle layout bounds', ['show layout bounds', 'borders', 'margins', 'debug.layout'], <icons.LayoutIcon />, actions.toggleLayoutBounds, 'Layout bounds'),
  toggleCommand('dev.show-touches', 'Toggle show touches', ['taps', 'touch feedback', 'dots'], <icons.TouchIcon />, actions.toggleShowTouches, 'Show touches'),
  toggleCommand('dev.pointer-location', 'Toggle pointer location', ['coordinates', 'crosshair', 'touch position'], <icons.CrosshairIcon />, actions.togglePointerLocation, 'Pointer location'),
  {
    id: 'dev.animations-off',
    kind: 'action',
    title: 'Turn animations off',
    keywords: ['animation scale 0', 'disable animations', 'espresso', 'tests', 'window transition animator'],
    group: 'dev-options',
    icon: <icons.AnimationIcon />,
    when: needsDevice,
    run: ({ device }) =>
      withToast('Turning animations off…', () => actions.setAnimationScales(device!.id, 0), () => ({ title: 'Animations off', description: 'Window, transition and animator scales set to 0.' }), 'Could not change animation scales'),
  },
  {
    id: 'dev.animations-normal',
    kind: 'action',
    title: 'Reset animations to 1x',
    keywords: ['animation scale 1', 'enable animations', 'normal speed', 'default'],
    group: 'dev-options',
    icon: <icons.AnimationIcon />,
    when: needsDevice,
    run: ({ device }) =>
      withToast('Resetting animations…', () => actions.setAnimationScales(device!.id, 1), () => ({ title: 'Animations at 1x' }), 'Could not change animation scales'),
  },
];

const logCommands: Command[] = [
  {
    id: 'logs.clear-view',
    kind: 'action',
    title: 'Clear log view',
    keywords: ['empty', 'reset logs', 'clean'],
    group: 'logs',
    icon: <icons.EraseIcon />,
    run: async (ctx) => {
      await ctx.clearLogView();
      toast.success('Log view cleared');
    },
  },
  {
    id: 'logs.pause',
    kind: 'action',
    title: 'Pause log view',
    keywords: ['freeze', 'stop scrolling', 'hold'],
    group: 'logs',
    icon: <icons.PauseIcon />,
    hidden: (ctx) => ctx.logs.isPaused,
    run: (ctx) => {
      ctx.toggleLogPause();
      toast.info('Log view paused', { description: 'New lines keep arriving and show when you resume.' });
    },
  },
  {
    id: 'logs.resume',
    kind: 'action',
    title: 'Resume log view',
    keywords: ['unpause', 'continue', 'play'],
    group: 'logs',
    icon: <icons.PlayIcon />,
    hidden: (ctx) => !ctx.logs.isPaused,
    run: (ctx) => {
      ctx.toggleLogPause();
      toast.info('Log view resumed');
    },
  },
  {
    id: 'logs.mode-rn',
    kind: 'action',
    title: 'Show React Native logs only',
    keywords: ['filter', 'sdk', 'js', 'console'],
    group: 'logs',
    icon: <icons.FilterIcon />,
    hidden: (ctx) => ctx.logs.logMode === 'rn',
    run: (ctx) => {
      ctx.setLogMode('rn');
      ctx.navigate('logs');
    },
  },
  {
    id: 'logs.mode-app',
    kind: 'action',
    title: 'Show logs from the selected app',
    keywords: ['filter', 'package', 'native', 'pid'],
    group: 'logs',
    icon: <icons.FilterIcon />,
    hidden: (ctx) => ctx.logs.logMode === 'app',
    run: (ctx) => {
      ctx.setLogMode('app');
      ctx.navigate('logs');
    },
  },
  {
    id: 'logs.mode-device',
    kind: 'action',
    title: 'Show all device logs',
    keywords: ['logcat', 'everything', 'native', 'filter', 'all'],
    group: 'logs',
    icon: <icons.LogsIcon />,
    hidden: (ctx) => ctx.logs.logMode === 'device',
    run: (ctx) => {
      ctx.setLogMode('device');
      ctx.navigate('logs');
    },
  },
  {
    id: 'logs.clear-device-buffer',
    kind: 'action',
    title: 'Clear device log buffer',
    keywords: ['logcat -c', 'flush', 'wipe logs'],
    group: 'logs',
    icon: <icons.TrashIcon />,
    when: needsDevice,
    run: ({ device }) =>
      withToast('Clearing device logs…', () => window.electronAPI.clearLogcat(device!.id), () => ({ title: 'Device log buffer cleared' }), 'Could not clear device logs'),
  },
  {
    id: 'logs.clear-crashes',
    kind: 'action',
    title: 'Clear crash list',
    keywords: ['crashes', 'anr', 'exceptions', 'reset'],
    group: 'logs',
    icon: <icons.XCircleIcon />,
    run: (ctx) => {
      ctx.clearCrashes();
      toast.success('Crash list cleared');
    },
  },
];

const windowCommands: Command[] = [
  {
    id: 'window.toggle-sidebar',
    kind: 'action',
    title: 'Toggle sidebar',
    keywords: ['collapse', 'expand', 'hide sidebar', 'show sidebar', 'navigation'],
    group: 'window',
    icon: <icons.SidebarIcon />,
    shortcut: ['⌘', 'B'],
    subtitle: (ctx) => (ctx.sidebarExpanded ? 'Collapse' : 'Expand'),
    run: (ctx) => ctx.toggleSidebar(),
  },
  {
    id: 'window.settings',
    kind: 'action',
    title: 'Open settings',
    keywords: ['preferences', 'options', 'config', 'polling'],
    group: 'window',
    icon: <icons.SettingsIcon />,
    shortcut: ['⌘', ','],
    run: (ctx) => ctx.navigate('settings'),
  },
  {
    id: 'window.check-updates',
    kind: 'action',
    title: 'Check for updates',
    keywords: ['update', 'upgrade', 'new version', 'release'],
    group: 'window',
    icon: <icons.DownloadIcon />,
    run: async () => {
      const id = toast.loading('Checking for updates…');
      try {
        const result = await window.electronAPI.checkForUpdates();
        if (result.error) updateToast(id, { kind: 'error', title: 'Could not check for updates', description: result.error });
        else if (result.updateAvailable) updateToast(id, { kind: 'success', title: `Version ${result.version} is available`, description: 'Download it from the update prompt or Settings.' });
        else updateToast(id, { kind: 'success', title: 'You’re on the latest version' });
      } catch (error) {
        updateToast(id, { kind: 'error', title: 'Could not check for updates', description: describeError(error) });
      }
    },
  },
];

const groupLabelByTab = new Map(
  navigationGroups.flatMap((group) => group.items.map((item) => [item.id, group.label] as const))
);

const navigationCommands: Command[] = allNavItems.map(
  (item): Command => ({
    id: `nav.${item.id}`,
    kind: 'action',
    title: item.label,
    keywords: ['go to', 'open', 'tool', groupLabelByTab.get(item.id) ?? ''].filter(Boolean),
    group: 'navigation',
    icon: item.icon,
    subtitle: (ctx) =>
      ctx.activeTab === item.id ? 'Current' : item.needsPackage && !ctx.packageName ? 'Needs an app' : groupLabelByTab.get(item.id),
    run: (ctx) => ctx.navigate(item.id),
  })
);

export const coreCommands: Command[] = [
  ...deviceCommands,
  ...appCommands,
  ...captureCommands,
  ...devOptionCommands,
  ...logCommands,
  ...windowCommands,
  ...navigationCommands,
];

export function registerCoreCommands(): () => void {
  return registerCommands(coreCommands);
}
