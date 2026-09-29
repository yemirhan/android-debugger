import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export interface SectionProps {
  title: string;
  /** Shown on the right of the title, e.g. a button or a count. */
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A titled group of content. */
export function Section({ title, action, children, style }: SectionProps) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
