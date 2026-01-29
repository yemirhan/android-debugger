import React from 'react';
import { Pressable, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

export function ActionButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
}: ActionButtonProps) {
  const variantStyles = {
    primary: {
      bg: '#4f46e5',
      bgPressed: '#4338ca',
      text: '#ffffff',
    },
    secondary: {
      bg: '#374151',
      bgPressed: '#4b5563',
      text: '#f9fafb',
    },
    danger: {
      bg: '#dc2626',
      bgPressed: '#b91c1c',
      text: '#ffffff',
    },
  };

  const colors = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.bgPressed : colors.bg },
        (disabled || loading) && styles.disabled,
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
    borderRadius: 8,
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
