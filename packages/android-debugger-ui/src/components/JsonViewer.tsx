import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export interface JsonViewerProps {
  data: unknown;
  /** Levels expanded initially. Default: 1 (the root's children are visible). */
  initialExpandDepth?: number;
  style?: StyleProp<ViewStyle>;
}

// Children rendered per object/array before a "show more" row, so a huge
// payload doesn't render thousands of rows at once.
const CHILD_PAGE_SIZE = 100;
const MAX_STRING_PREVIEW = 1000;

/** A collapsible, syntax-colored tree for JSON-like values. */
export function JsonViewer({ data, initialExpandDepth = 1, style }: JsonViewerProps) {
  return (
    <View style={[styles.container, style]}>
      <JsonNode value={data} depth={0} expandDepth={initialExpandDepth} />
    </View>
  );
}

interface JsonNodeProps {
  name?: string;
  value: unknown;
  depth: number;
  expandDepth: number;
}

function JsonNode({ name, value, depth, expandDepth }: JsonNodeProps) {
  const isContainer = value !== null && typeof value === 'object';
  const [expanded, setExpanded] = useState(depth < expandDepth);
  const [limit, setLimit] = useState(CHILD_PAGE_SIZE);

  const label = name !== undefined ? <Text style={styles.key}>{name}: </Text> : null;

  if (!isContainer) {
    return (
      <View style={[styles.row, { paddingLeft: depth * 14 }]}>
        <Text style={styles.line} selectable>
          {label}
          <Primitive value={value} />
        </Text>
      </View>
    );
  }

  const isArray = Array.isArray(value);
  const entries: Array<[string, unknown]> = isArray
    ? (value as unknown[]).map((item, index) => [String(index), item])
    : Object.entries(value as Record<string, unknown>);
  const summary = isArray ? `Array(${entries.length})` : `{${entries.length} ${entries.length === 1 ? 'key' : 'keys'}}`;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((current) => !current)}
        disabled={entries.length === 0}
        style={({ pressed }) => [styles.row, { paddingLeft: depth * 14 }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.line}>
          <Text style={styles.chevron}>{entries.length === 0 ? '  ' : expanded ? '▾ ' : '▸ '}</Text>
          {label}
          <Text style={styles.summary}>{summary}</Text>
        </Text>
      </Pressable>
      {expanded
        ? entries.slice(0, limit).map(([key, child]) => (
            <JsonNode key={key} name={key} value={child} depth={depth + 1} expandDepth={expandDepth} />
          ))
        : null}
      {expanded && entries.length > limit ? (
        <Pressable onPress={() => setLimit((current) => current + CHILD_PAGE_SIZE)} style={[styles.row, { paddingLeft: (depth + 1) * 14 }]}>
          <Text style={styles.more}>Show {Math.min(CHILD_PAGE_SIZE, entries.length - limit)} more of {entries.length - limit}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Primitive({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    const text = value.length > MAX_STRING_PREVIEW ? `${value.slice(0, MAX_STRING_PREVIEW)}… (${value.length} chars)` : value;
    return <Text style={styles.string}>"{text}"</Text>;
  }
  if (typeof value === 'number') return <Text style={styles.number}>{String(value)}</Text>;
  if (typeof value === 'boolean') return <Text style={styles.boolean}>{String(value)}</Text>;
  if (value === null) return <Text style={styles.null}>null</Text>;
  return <Text style={styles.null}>{String(value)}</Text>;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  row: {
    paddingVertical: 2,
    paddingRight: theme.spacing.sm,
  },
  pressed: {
    backgroundColor: theme.colors.surfaceRaised,
  },
  line: {
    fontFamily: theme.fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  chevron: {
    color: theme.colors.textFaint,
  },
  key: {
    color: theme.colors.jsonKey,
  },
  summary: {
    color: theme.colors.textMuted,
  },
  string: {
    color: theme.colors.jsonString,
  },
  number: {
    color: theme.colors.jsonNumber,
  },
  boolean: {
    color: theme.colors.jsonBoolean,
  },
  null: {
    color: theme.colors.jsonNull,
  },
  more: {
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '600',
  },
});
