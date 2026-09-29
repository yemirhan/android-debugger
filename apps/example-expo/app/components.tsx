import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActionButton,
  Badge,
  EmptyState,
  FeatureCard,
  JsonViewer,
  KeyValueList,
  SearchField,
  Section,
  SegmentedControl,
  theme,
} from '@yemirhan/android-debugger-ui';

const SAMPLE = {
  user: { id: 42, name: 'Ada Lovelace', verified: true, manager: null },
  roles: ['admin', 'editor'],
  settings: { theme: 'dark', notifications: { email: false, push: true } },
  items: Array.from({ length: 150 }, (_, i) => ({ id: i, price: Math.round(i * 3.7 * 100) / 100 })),
};

type Size = 'small' | 'medium' | 'large';

export default function ComponentsScreen() {
  const [size, setSize] = useState<Size>('medium');
  const [query, setQuery] = useState('');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Section title="Badge">
        <View style={styles.row}>
          <Badge label="GET" mono />
          <Badge label="200" tone="success" mono />
          <Badge label="301" tone="info" mono />
          <Badge label="404" tone="warning" mono />
          <Badge label="500" tone="danger" mono />
          <Badge label="accent" tone="accent" />
          <Badge label="solid" tone="success" variant="solid" />
        </View>
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl<Size>
          value={size}
          onChange={setSize}
          options={[
            { value: 'small', label: 'Small', count: 3 },
            { value: 'medium', label: 'Medium', count: 12 },
            { value: 'large', label: 'Large' },
          ]}
        />
      </Section>

      <Section title="SearchField">
        <SearchField value={query} onChangeText={setQuery} placeholder="Type to filter" />
      </Section>

      <Section title="KeyValueList">
        <KeyValueList
          items={[
            { key: 'content-type', value: 'application/json; charset=utf-8' },
            { key: 'cache-control', value: 'no-cache' },
            { key: 'x-request-id', value: '7f3c9a2e-41d8-4b1e-9c7a-0e5b2f6d8a13' },
          ]}
        />
      </Section>

      <Section title="JsonViewer" action={<Badge label="tap to expand" />}>
        <JsonViewer data={SAMPLE} />
      </Section>

      <Section title="EmptyState">
        <View style={styles.box}>
          <EmptyState icon="cloud-offline-outline" title="Nothing here yet" description="Lists use this when they have no rows." />
        </View>
      </Section>

      <Section title="FeatureCard">
        <FeatureCard title="Home" description="Navigates with expo-router" icon="home" href="/" />

      </Section>

      <Section title="ActionButton">
        <ActionButton title="Primary" icon="play" onPress={() => {}} />
        <ActionButton title="Secondary" icon="settings" variant="secondary" onPress={() => {}} />
        <ActionButton title="Danger" icon="trash" variant="danger" onPress={() => {}} />
        <ActionButton title="Loading" loading onPress={() => {}} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 48,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  box: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
});
