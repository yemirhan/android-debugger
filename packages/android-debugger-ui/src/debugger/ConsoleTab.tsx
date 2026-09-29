import React, { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { ConsoleMessage } from '@android-debugger/shared';
import { EmptyState } from '../components/EmptyState';
import { JsonViewer } from '../components/JsonViewer';
import { SearchField } from '../components/SearchField';
import { SegmentedControl } from '../components/SegmentedControl';
import { formatConsoleArgs, formatTime, matchesQuery } from '../format';
import { useConsoleLogs } from '../hooks';
import type { ConsoleEntry } from '../store';
import { theme } from '../theme';
import { Row, listStyles } from './shared';

type Level = ConsoleMessage['level'];
type LevelFilter = 'all' | Level;

const LEVEL_COLORS: Record<Level, string> = {
  error: theme.colors.danger,
  warn: theme.colors.warning,
  info: theme.colors.info,
  log: theme.colors.textSecondary,
  debug: theme.colors.textFaint,
};

const LEVEL_FILTERS: Array<{ value: LevelFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
  { value: 'log', label: 'Log' },
  { value: 'debug', label: 'Debug' },
];

export function ConsoleTab() {
  const logs = useConsoleLogs();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const counts = useMemo(() => {
    const result: Record<LevelFilter, number> = { all: logs.length, error: 0, warn: 0, info: 0, log: 0, debug: 0 };
    for (const entry of logs) result[entry.level] = (result[entry.level] ?? 0) + 1;
    return result;
  }, [logs]);

  const rows = useMemo(
    () =>
      logs
        .filter((entry) => (level === 'all' || entry.level === level) && matchesQuery(query, formatConsoleArgs(entry.args)))
        .reverse(),
    [logs, level, query]
  );

  return (
    <View style={listStyles.grow}>
      <View style={listStyles.toolbar}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Filter messages" />
        <SegmentedControl<LevelFilter>
          value={level}
          onChange={setLevel}
          options={LEVEL_FILTERS.map((option) => ({ ...option, count: counts[option.value] }))}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(entry) => String(entry.id)}
        renderItem={({ item }) => (
          <ConsoleRow
            entry={item}
            expanded={expandedId === item.id}
            onPress={() => setExpandedId((current) => (current === item.id ? null : item.id))}
          />
        )}
        contentContainerStyle={listStyles.content}
        initialNumToRender={25}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="terminal-outline"
            title={logs.length === 0 ? 'No console output yet' : 'No matching messages'}
            description={logs.length === 0 ? 'console.log, info, warn, error and debug calls show up here.' : undefined}
          />
        }
      />
    </View>
  );
}

function ConsoleRow({ entry, expanded, onPress }: { entry: ConsoleEntry; expanded: boolean; onPress: () => void }) {
  const color = LEVEL_COLORS[entry.level] ?? theme.colors.textSecondary;
  const structured = entry.args.filter((arg) => arg !== null && typeof arg === 'object');
  return (
    <Row onPress={onPress} accent={color}>
      <Text style={[listStyles.primary, listStyles.mono, { color }]} numberOfLines={expanded ? undefined : 3} selectable={expanded}>
        {formatConsoleArgs(entry.args, expanded ? 20_000 : 500)}
      </Text>
      <Text style={listStyles.secondary}>
        {formatTime(entry.timestamp)}  ·  {entry.level}
        {structured.length > 0 && !expanded ? '  ·  tap to inspect' : ''}
      </Text>
      {expanded && structured.length > 0 ? (
        <View style={listStyles.expanded}>
          {structured.map((arg, index) => (
            <JsonViewer key={index} data={arg} />
          ))}
        </View>
      ) : null}
    </Row>
  );
}
