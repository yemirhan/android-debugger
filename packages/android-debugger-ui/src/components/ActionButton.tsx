import React from 'react';
import { Pressable, StyleSheet, Text, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

export interface ActionButtonProps {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ActionButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ActionButtonProps) {
  const variantStyles = {
    primary: { bg: theme.colors.accentStrong, bgPressed: theme.colors.accentPressed, text: '#ffffff' },
    secondary: { bg: theme.colors.neutralStrong, bgPressed: theme.colors.neutralPressed, text: theme.colors.text },
    danger: { bg: theme.colors.dangerStrong, bgPressed: theme.colors.dangerPressed, text: '#ffffff' },
  };

  const colors = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.bgPressed : colors.bg },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={colors.text} style={styles.icon} />}
          <Text style={[styles.text, { color: colors.text }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    marginBottom: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
});
