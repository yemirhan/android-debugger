import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { JsonViewer } from '../components/JsonViewer';
import { tryParseJson } from '../format';
import { theme } from '../theme';

// Building blocks shared by the debugger tabs.

const MAX_TEXT_BODY = 20_000;

/** A request/response body: a JSON tree when it parses, selectable text otherwise. */
export function BodyView({ body }: { body: string | undefined }) {
  if (!body) return <Text style={styles.muted}>No body</Text>;
  const parsed = tryParseJson(body);
  if (parsed.ok) return <JsonViewer data={parsed.value} initialExpandDepth={2} />;
  const text = body.length > MAX_TEXT_BODY ? `${body.slice(0, MAX_TEXT_BODY)}… (${body.length} chars)` : body;
  return (
    <View style={styles.textBody}>
      <Text style={styles.mono} selectable>
        {text}
      </Text>
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

/** A pressable list row with the debugger's row styling. */
export function Row({ onPress, children, accent }: { onPress?: () => void; children: ReactNode; accent?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
      <View style={styles.rowContent}>{children}</View>
    </Pressable>
  );
}

export const listStyles = StyleSheet.create({
  toolbar: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  // Room for the Android navigation bar in edge-to-edge layouts.
  content: {
    paddingBottom: 48,
  },
  primary: {
    fontSize: 13,
    color: theme.colors.text,
  },
  secondary: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  mono: {
    fontFamily: theme.fonts.mono,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  grow: {
    flex: 1,
  },
  // Badges align to the top by default; center them in rows.
  badge: {
    alignSelf: 'center',
  },
  expanded: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});

const styles = StyleSheet.create({
  muted: {
    fontSize: 12,
    color: theme.colors.textFaint,
  },
  textBody: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    padding: theme.spacing.sm,
  },
  mono: {
    fontFamily: theme.fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  iconButton: {
    padding: 6,
    borderRadius: theme.radius.sm,
  },
  iconButtonPressed: {
    backgroundColor: theme.colors.surfaceRaised,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface,
  },
  accent: {
    width: 3,
  },
  rowContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
  },
});
