import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}

/** A centered placeholder for lists with nothing to show. */
export function EmptyState({ icon = 'file-tray-outline', title, description }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={theme.colors.textFaint} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: theme.spacing.xl,
  },
  title: {
    marginTop: theme.spacing.md,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  description: {
    marginTop: theme.spacing.xs,
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
