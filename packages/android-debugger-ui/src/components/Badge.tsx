import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme, toneColors, type Tone } from '../theme';

export interface BadgeProps {
  label: string;
  tone?: Tone;
  /** `soft` (tinted background, default) or `solid`. */
  variant?: 'soft' | 'solid';
  /** Monospace text, e.g. for HTTP methods and status codes. */
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A small pill for statuses, counts and labels. */
export function Badge({ label, tone = 'neutral', variant = 'soft', mono = false, style }: BadgeProps) {
  const { fg, bg } = toneColors(tone);
  const solid = variant === 'solid';
  return (
    <View style={[styles.badge, { backgroundColor: solid ? fg : bg }, style]}>
      <Text style={[styles.text, { color: solid ? theme.colors.background : fg }, mono && styles.mono]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
  mono: {
    fontFamily: theme.fonts.mono,
  },
});
