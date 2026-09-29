import React from 'react';
import type { AvdInfo } from '../../main/emulator-types';
import { getAppSettings } from '../lib/app-settings';
import {
  getEmulatorState,
  refreshEmulators,
  requestCreateEmulator,
  startEmulator,
  stopEmulator,
  versionLabel,
} from '../lib/emulators';
import * as icons from './icons';
import { registerCommands } from './registry';
import type { Command, CommandChoice } from './types';

/** Loads a fresh emulator list for a choices page. */
async function loadAvds(): Promise<{ avds: AvdInfo[]; canStart: boolean; hasSdk: boolean }> {
  await refreshEmulators();
  const { avds, setup } = getEmulatorState();
  return { avds, canStart: !!setup?.canStart, hasSdk: !!setup?.sdkPath };
}

function subtitle(avd: AvdInfo): string {
  return [versionLabel(avd.androidVersion, avd.apiLevel), avd.serial ?? avd.name].join(' · ');
}

const stateBadge: Partial<Record<AvdInfo['state'], string>> = {
  running: 'Running',
  starting: 'Starting',
  booting: 'Booting',
  stopping: 'Stopping',
};

export const emulatorCommands: Command[] = [
  {
    id: 'emulator.start',
    kind: 'choices',
    title: 'Start emulator',
    keywords: ['avd', 'virtual device', 'boot', 'launch', 'simulator', 'sim', 'android emulator'],
    group: 'emulators',
    icon: <icons.PlayIcon />,
    placeholder: 'Search emulators…',
    emptyText: 'No emulators found. Create one with “Create emulator”.',
    load: async (): Promise<CommandChoice[]> => {
      const { avds, canStart, hasSdk } = await loadAvds();
      if (!hasSdk) return [];
      const noAudio = getAppSettings().emulatorNoAudio;
      return avds.map((avd) => ({
        id: avd.name,
        title: avd.displayName,
        subtitle: subtitle(avd),
        keywords: [avd.name, avd.apiLevel ?? '', avd.androidVersion ?? '', avd.deviceProfile ?? ''].filter(Boolean),
        icon: <icons.EmulatorIcon />,
        badge: stateBadge[avd.state],
        disabled:
          avd.state !== 'stopped'
            ? 'Already running'
            : !canStart
              ? 'Install the Android Emulator first'
              : !avd.systemImageInstalled
                ? 'Its system image is not installed'
                : undefined,
        run: () => {
          void startEmulator(avd, { noAudio });
        },
      }));
    },
  },
  {
    id: 'emulator.stop',
    kind: 'choices',
    title: 'Stop emulator',
    keywords: ['avd', 'shut down', 'kill', 'close', 'quit', 'simulator', 'sim'],
    group: 'emulators',
    icon: <icons.StopIcon />,
    placeholder: 'Search running emulators…',
    emptyText: 'No emulator is running.',
    load: async (): Promise<CommandChoice[]> => {
      const { avds } = await loadAvds();
      return avds
        .filter((avd) => avd.state === 'running' || avd.state === 'booting' || avd.state === 'starting')
        .map((avd) => ({
          id: avd.name,
          title: avd.displayName,
          subtitle: subtitle(avd),
          keywords: [avd.name, avd.serial ?? ''].filter(Boolean),
          icon: <icons.EmulatorIcon />,
          badge: stateBadge[avd.state],
          run: () => {
            void stopEmulator(avd);
          },
        }));
    },
  },
  {
    id: 'emulator.open-manager',
    kind: 'action',
    title: 'Open emulator manager',
    keywords: ['avd manager', 'virtual devices', 'emulators', 'simulators', 'system images'],
    group: 'emulators',
    icon: <icons.EmulatorIcon />,
    run: (ctx) => ctx.navigate('emulators'),
  },
  {
    id: 'emulator.create',
    kind: 'action',
    title: 'Create emulator…',
    keywords: ['new avd', 'add emulator', 'new virtual device', 'simulator', 'avdmanager'],
    group: 'emulators',
    icon: <icons.PlusIcon />,
    run: (ctx) => {
      requestCreateEmulator();
      ctx.navigate('emulators');
    },
  },
];

export function registerEmulatorCommands(): () => void {
  return registerCommands(emulatorCommands);
}
