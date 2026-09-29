import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown next to the label when set. */
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

/** Horizontally scrollable tabs/filters; one option is always selected. */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.scroll, style]} contentContainerStyle={styles.container}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.option, selected && styles.selected, pressed && !selected && styles.pressed]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
            {option.count !== undefined ? (
              <View style={[styles.count, selected && styles.selectedCount]}>
                <Text style={[styles.countText, selected && styles.selectedLabel]}>{option.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  container: {
    gap: theme.spacing.xs,
    padding: 3,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
  },
  selected: {
    backgroundColor: theme.colors.accentStrong,
  },
  pressed: {
    backgroundColor: theme.colors.surfaceRaised,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  selectedLabel: {
    color: theme.colors.text,
  },
  count: {
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: 'center',
  },
  selectedCount: {
    backgroundColor: theme.colors.accentPressed,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
});
