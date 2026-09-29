import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDebuggerConnection } from '../hooks';
import { theme } from '../theme';

export interface ConnectionStatusProps {
  /** Overrides the live connection state from the SDK. */
  connected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Whether the Android Debugger desktop app is receiving this app's data. Updates live. */
export function ConnectionStatus({ connected: connectedProp, style }: ConnectionStatusProps) {
  const live = useDebuggerConnection();
  const connected = connectedProp ?? live;
  const color = connected ? theme.colors.success : theme.colors.warning;

  return (
    <View
      style={[styles.container, { backgroundColor: connected ? theme.colors.successMuted : theme.colors.warningMuted }, style]}
      accessibilityRole="text"
      accessibilityLabel={connected ? 'Connected to Android Debugger' : 'Waiting for Android Debugger'}
    >
      <Ionicons name={connected ? 'radio' : 'radio-outline'} size={16} color={color} />
      <Text style={[styles.text, { color }]}>
        {connected ? 'Connected to Android Debugger' : 'Waiting for Android Debugger'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
});
