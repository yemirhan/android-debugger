import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { NetworkRequest } from '@android-debugger/shared';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { KeyValueList } from '../components/KeyValueList';
import { SearchField } from '../components/SearchField';
import { Section } from '../components/Section';
import { SegmentedControl } from '../components/SegmentedControl';
import {
  formatBytes,
  formatDuration,
  formatTime,
  isFailedRequest,
  matchesQuery,
  requestState,
  splitUrl,
  toCurl,
  type RequestState,
} from '../format';
import { useNetworkRequests } from '../hooks';
import { theme, type Tone } from '../theme';
import { BodyView, IconButton, Row, listStyles } from './shared';

type NetworkFilter = 'all' | 'failed' | 'pending';

const STATE_TONES: Record<RequestState, Tone> = {
  pending: 'neutral',
  success: 'success',
  redirect: 'info',
  'client-error': 'warning',
  'server-error': 'danger',
  failed: 'danger',
};

export function NetworkTab() {
  const requests = useNetworkRequests();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NetworkFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      requests
        .filter((request) => {
          if (filter === 'failed' && !isFailedRequest(request)) return false;
          if (filter === 'pending' && requestState(request) !== 'pending') return false;
          return matchesQuery(query, request.url, request.method, request.status?.toString());
        })
        .reverse(),
    [requests, query, filter]
  );
  const failedCount = useMemo(() => requests.filter(isFailedRequest).length, [requests]);

  const selected = selectedId ? requests.find((request) => request.id === selectedId) : undefined;
  if (selected) return <NetworkDetail request={selected} onBack={() => setSelectedId(null)} />;

  return (
    <View style={listStyles.grow}>
      <View style={listStyles.toolbar}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Filter by URL, method or status" />
        <SegmentedControl<NetworkFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: requests.length },
            { value: 'failed', label: 'Failed', count: failedCount },
            { value: 'pending', label: 'Pending' },
          ]}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(request) => request.id}
        renderItem={({ item }) => <RequestRow request={item} onPress={() => setSelectedId(item.id)} />}
        contentContainerStyle={listStyles.content}
        initialNumToRender={20}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="globe-outline"
            title={requests.length === 0 ? 'No requests yet' : 'No matching requests'}
            description={requests.length === 0 ? 'fetch, XMLHttpRequest and intercepted axios calls show up here.' : undefined}
          />
        }
      />
    </View>
  );
}

function RequestRow({ request, onPress }: { request: NetworkRequest; onPress: () => void }) {
  const state = requestState(request);
  const { host, path } = splitUrl(request.url);
  return (
    <Row onPress={onPress}>
      <View style={listStyles.line}>
        <Badge style={listStyles.badge} label={request.method} mono />
        <Text style={[listStyles.primary, listStyles.grow]} numberOfLines={1}>
          {path}
        </Text>
        <Badge style={listStyles.badge} label={request.error ? 'ERR' : request.status ? String(request.status) : '…'} tone={STATE_TONES[state]} mono />
      </View>
      <Text style={listStyles.secondary} numberOfLines={1}>
        {[host, formatTime(request.timestamp), formatDuration(request.duration)].filter(Boolean).join('  ·  ')}
      </Text>
    </Row>
  );
}

function headerItems(headers: Record<string, string> | undefined) {
  return Object.entries(headers ?? {}).map(([key, value]) => ({ key, value: String(value) }));
}

function NetworkDetail({ request, onBack }: { request: NetworkRequest; onBack: () => void }) {
  const state = requestState(request);
  const overview = [
    { key: 'URL', value: request.url },
    { key: 'Method', value: request.method },
    { key: 'Status', value: request.error ? `Failed: ${request.error}` : request.status ? String(request.status) : 'Pending' },
    { key: 'Started', value: formatTime(request.timestamp) },
    { key: 'Duration', value: formatDuration(request.duration) },
  ];
  if (request.responseBody !== undefined) overview.push({ key: 'Response size', value: formatBytes(request.responseBody.length) });

  const share = (message: string) => {
    Share.share({ message }).catch(() => {});
  };

  return (
    <View style={listStyles.grow}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" label="Back to requests" onPress={onBack} />
        <Badge style={listStyles.badge} label={request.method} mono />
        <Text style={[listStyles.primary, listStyles.grow]} numberOfLines={1}>
          {splitUrl(request.url).path}
        </Text>
        <Badge style={listStyles.badge} label={request.error ? 'ERR' : request.status ? String(request.status) : '…'} tone={STATE_TONES[state]} mono />
        <IconButton icon="terminal-outline" label="Share as cURL" onPress={() => share(toCurl(request))} />
        {request.responseBody ? (
          <IconButton icon="share-outline" label="Share response body" onPress={() => share(request.responseBody!)} />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Overview">
          <KeyValueList items={overview} />
        </Section>
        <Section title="Request headers">
          <KeyValueList items={headerItems(request.headers)} emptyText="No headers" />
        </Section>
        <Section title="Request body">
          <BodyView body={request.body} />
        </Section>
        <Section title="Response headers">
          <KeyValueList items={headerItems(request.responseHeaders)} emptyText={state === 'pending' ? 'Waiting for response' : 'No headers'} />
        </Section>
        <Section title="Response body">
          <BodyView body={request.responseBody} />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 48,
  },
});
