import React, { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { JsonViewer } from '../components/JsonViewer';
import { SearchField } from '../components/SearchField';
import { formatTime, matchesQuery } from '../format';
import { useStateSnapshots } from '../hooks';
import type { StateEntry } from '../store';
import { Row, listStyles } from './shared';

export function StateTab() {
  const states = useStateSnapshots();
  const [query, setQuery] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const rows = useMemo(() => states.filter((entry) => matchesQuery(query, entry.name)).reverse(), [states, query]);

  return (
    <View style={listStyles.grow}>
      <View style={listStyles.toolbar}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Filter by store name" />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(entry) => entry.key}
        renderItem={({ item }) => (
          <StateRow
            entry={item}
            expanded={expandedKey === item.key}
            onPress={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
          />
        )}
        contentContainerStyle={listStyles.content}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="layers-outline"
            title={states.length === 0 ? 'No state yet' : 'No matching stores'}
            description={
              states.length === 0
                ? 'AndroidDebugger.sendState(), the Redux middleware and interceptZustandStore() report here.'
                : undefined
            }
          />
        }
      />
    </View>
  );
}

function StateRow({ entry, expanded, onPress }: { entry: StateEntry; expanded: boolean; onPress: () => void }) {
  return (
    <Row onPress={onPress}>
      <View style={listStyles.line}>
        <Text style={[listStyles.primary, listStyles.grow]} numberOfLines={1}>
          {entry.name}
        </Text>
        <Badge style={listStyles.badge} label={entry.source} tone={entry.source === 'zustand' ? 'warning' : 'accent'} />
      </View>
      <Text style={listStyles.secondary}>
        Updated {formatTime(entry.timestamp)}  ·  {entry.updates} {entry.updates === 1 ? 'update' : 'updates'}
        {expanded ? '' : '  ·  tap to inspect'}
      </Text>
      {expanded ? (
        <View style={listStyles.expanded}>
          <JsonViewer data={entry.state} />
        </View>
      ) : null}
    </Row>
  );
}
