import React, { useState } from 'react';
import { DevSettings, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SDK_VERSION } from '@yemirhan/android-debugger-sdk';
import { SegmentedControl } from '../components/SegmentedControl';
import { useDebuggerConnection, useDebuggerData } from '../hooks';
import { clearDebuggerData, type DebuggerDataKind } from '../store';
import { theme } from '../theme';
import { ConsoleTab } from './ConsoleTab';
import { EventsTab } from './EventsTab';
import { NetworkTab } from './NetworkTab';
import { StateTab } from './StateTab';
import { IconButton } from './shared';

declare const __DEV__: boolean | undefined;

export type DebuggerTab = 'network' | 'console' | 'events' | 'state';

const TAB_DATA: Record<DebuggerTab, DebuggerDataKind> = {
  network: 'network',
  console: 'console',
  events: 'events',
  state: 'states',
};

export interface DebuggerPanelProps {
  initialTab?: DebuggerTab;
  /** Shows a close button when set. */
  onClose?: () => void;
  /** Extra space above the header, e.g. for a translucent status bar. */
  insetTop?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The in-app debugger: network requests, console output, events and state
 * captured by the SDK on this device. Works whether or not the desktop app is
 * connected. Render it in a screen of your own, or use DebuggerOverlay.
 */
export function DebuggerPanel({ initialTab = 'network', onClose, insetTop = 0, style }: DebuggerPanelProps) {
  const [tab, setTab] = useState<DebuggerTab>(initialTab);
  const data = useDebuggerData();
  const connected = useDebuggerConnection();
  const isDev = typeof __DEV__ === 'undefined' || __DEV__;

  return (
    <View style={[styles.panel, { paddingTop: insetTop }, style]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Android Debugger</Text>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: connected ? theme.colors.success : theme.colors.warning }]} />
            <Text style={styles.statusText} numberOfLines={1}>
              {connected ? 'Desktop connected' : 'Desktop not connected'}  ·  SDK {SDK_VERSION}
            </Text>
          </View>
        </View>
        <IconButton icon="trash-outline" label={`Clear ${tab}`} onPress={() => clearDebuggerData(TAB_DATA[tab])} />
        {isDev ? <IconButton icon="refresh" label="Reload app" onPress={() => DevSettings.reload()} /> : null}
        {onClose ? <IconButton icon="close" label="Close debugger" onPress={onClose} /> : null}
      </View>
      <SegmentedControl<DebuggerTab>
        value={tab}
        onChange={setTab}
        style={styles.tabs}
        options={[
          { value: 'network', label: 'Network', count: data.network.length },
          { value: 'console', label: 'Console', count: data.console.length },
          { value: 'events', label: 'Events', count: data.events.length },
          { value: 'state', label: 'State', count: data.states.length },
        ]}
      />
      <View style={styles.body}>
        {tab === 'network' ? <NetworkTab /> : null}
        {tab === 'console' ? <ConsoleTab /> : null}
        {tab === 'events' ? <EventsTab /> : null}
        {tab === 'state' ? <StateTab /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  tabs: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  body: {
    flex: 1,
  },
});
