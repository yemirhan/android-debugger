import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export interface KeyValueItem {
  key: string;
  value: string;
}

export interface KeyValueListProps {
  items: readonly KeyValueItem[];
  /** Shown when `items` is empty. */
  emptyText?: string;
  style?: StyleProp<ViewStyle>;
}

/** Aligned key/value rows (headers, metadata). Values are selectable. */
export function KeyValueList({ items, emptyText = 'None', style }: KeyValueListProps) {
  return (
    <View style={[styles.container, style]}>
      {items.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        items.map((item, index) => (
          <View key={`${item.key}-${index}`} style={[styles.row, index > 0 && styles.divider]}>
            <Text style={styles.key} selectable>
              {item.key}
            </Text>
            <Text style={styles.value} selectable>
              {item.value}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    paddingHorizontal: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  key: {
    width: '35%',
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.mono,
  },
  value: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
  },
  empty: {
    fontSize: 12,
    color: theme.colors.textFaint,
    paddingVertical: theme.spacing.sm,
  },
});
