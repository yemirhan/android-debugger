import React, { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { JsonViewer } from '../components/JsonViewer';
import { SearchField } from '../components/SearchField';
import { formatDuration, formatTime, matchesQuery } from '../format';
import { useDebuggerEvents } from '../hooks';
import type { TimelineEvent } from '../store';
import { Row, listStyles } from './shared';

export function EventsTab() {
  const events = useDebuggerEvents();
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const rows = useMemo(() => events.filter((event) => matchesQuery(query, event.name)).reverse(), [events, query]);

  return (
    <View style={listStyles.grow}>
      <View style={listStyles.toolbar}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Filter by event name" />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(event) => String(event.id)}
        renderItem={({ item }) => (
          <EventRow
            event={item}
            expanded={expandedId === item.id}
            onPress={() => setExpandedId((current) => (current === item.id ? null : item.id))}
          />
        )}
        contentContainerStyle={listStyles.content}
        initialNumToRender={20}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="flash-outline"
            title={events.length === 0 ? 'No events yet' : 'No matching events'}
            description={
              events.length === 0
                ? 'AndroidDebugger.trackEvent(), Redux actions and markStart()/markEnd() timings show up here.'
                : undefined
            }
          />
        }
      />
    </View>
  );
}

function EventRow({ event, expanded, onPress }: { event: TimelineEvent; expanded: boolean; onPress: () => void }) {
  const isPerformance = event.kind === 'performance';
  const hasData = !isPerformance && event.data !== undefined;
  return (
    <Row onPress={hasData ? onPress : undefined}>
      <View style={listStyles.line}>
        <Badge style={listStyles.badge} label={isPerformance ? 'perf' : 'event'} tone={isPerformance ? 'info' : 'accent'} />
        <Text style={[listStyles.primary, listStyles.grow]} numberOfLines={1}>
          {event.name}
        </Text>
        {isPerformance ? <Badge style={listStyles.badge} label={formatDuration(event.duration)} tone="info" mono /> : null}
      </View>
      <Text style={listStyles.secondary}>{formatTime(event.timestamp)}</Text>
      {expanded && hasData ? (
        <View style={listStyles.expanded}>
          <JsonViewer data={event.data} />
        </View>
      ) : null}
    </Row>
  );
}
