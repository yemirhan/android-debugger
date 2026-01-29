import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import { ActionButton, ResultDisplay, ConnectionStatus } from '@yemirhan/android-debugger-ui';
import { apiHelpers } from '@/utils/api';

export default function PerformanceScreen() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const addResult = (message: string) => {
    setResults((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleSyncOperation = () => {
    AndroidDebugger.markStart('sync_operation');

    // Simulate some synchronous work
    let sum = 0;
    for (let i = 0; i < 1000000; i++) {
      sum += i;
    }

    AndroidDebugger.markEnd('sync_operation');
    addResult(`Sync operation completed (sum: ${sum})`);
  };

  const handleAsyncDelay = async () => {
    setLoading('delay');
    AndroidDebugger.markStart('async_delay');

    await new Promise((resolve) => setTimeout(resolve, 1500));

    AndroidDebugger.markEnd('async_delay');
    addResult('Async delay completed (1.5s)');
    setLoading(null);
  };

  const handleApiCall = async () => {
    setLoading('api');
    AndroidDebugger.markStart('api_call');

    try {
      await apiHelpers.getPost(1);
      AndroidDebugger.markEnd('api_call');
      addResult('API call completed');
    } catch {
      AndroidDebugger.markEnd('api_call');
      addResult('API call failed');
    }

    setLoading(null);
  };

  const handleMultipleApis = async () => {
    setLoading('multi-api');
    AndroidDebugger.markStart('multiple_api_calls');

    try {
      AndroidDebugger.markStart('fetch_posts');
      await apiHelpers.getPosts();
      AndroidDebugger.markEnd('fetch_posts');

      AndroidDebugger.markStart('fetch_users');
      await apiHelpers.getUsers();
      AndroidDebugger.markEnd('fetch_users');

      AndroidDebugger.markEnd('multiple_api_calls');
      addResult('Multiple API calls completed');
    } catch {
      AndroidDebugger.markEnd('multiple_api_calls');
      addResult('Multiple API calls failed');
    }

    setLoading(null);
  };

  const handleComponentRender = () => {
    AndroidDebugger.markStart('render_simulation');

    // Simulate render work
    const items = [];
    for (let i = 0; i < 1000; i++) {
      items.push({ id: i, value: Math.random() });
    }
    items.sort((a, b) => a.value - b.value);

    AndroidDebugger.markEnd('render_simulation');
    addResult('Render simulation completed (1000 items sorted)');
  };

  const handleDataProcessing = () => {
    AndroidDebugger.markStart('data_processing');

    // Step 1: Parse
    AndroidDebugger.markStart('parse_step');
    const data = Array.from({ length: 5000 }, (_, i) => ({
      id: i,
      value: Math.random() * 100,
    }));
    AndroidDebugger.markEnd('parse_step');

    // Step 2: Transform
    AndroidDebugger.markStart('transform_step');
    const transformed = data.map((item) => ({
      ...item,
      squared: item.value * item.value,
    }));
    AndroidDebugger.markEnd('transform_step');

    // Step 3: Filter
    AndroidDebugger.markStart('filter_step');
    const filtered = transformed.filter((item) => item.squared > 2500);
    AndroidDebugger.markEnd('filter_step');

    AndroidDebugger.markEnd('data_processing');
    addResult(`Data processing completed (${filtered.length} items after filter)`);
  };

  const handleMemoryIntensive = async () => {
    setLoading('memory');
    AndroidDebugger.markStart('memory_intensive');

    // Create and process large arrays
    const arrays = [];
    for (let i = 0; i < 10; i++) {
      arrays.push(Array.from({ length: 10000 }, () => Math.random()));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const sums = arrays.map((arr) => arr.reduce((a, b) => a + b, 0));

    AndroidDebugger.markEnd('memory_intensive');
    addResult(`Memory intensive completed (10 arrays, sum: ${sums[0].toFixed(2)}...)`);
    setLoading(null);
  };

  const handleMultiStepFlow = async () => {
    setLoading('flow');
    AndroidDebugger.markStart('full_flow');

    // Step 1: Initialize
    AndroidDebugger.markStart('flow_init');
    await new Promise((resolve) => setTimeout(resolve, 200));
    AndroidDebugger.markEnd('flow_init');

    // Step 2: Fetch data
    AndroidDebugger.markStart('flow_fetch');
    await apiHelpers.getPost(1);
    AndroidDebugger.markEnd('flow_fetch');

    // Step 3: Process
    AndroidDebugger.markStart('flow_process');
    for (let i = 0; i < 500000; i++) {
      // simulate work
    }
    AndroidDebugger.markEnd('flow_process');

    // Step 4: Cleanup
    AndroidDebugger.markStart('flow_cleanup');
    await new Promise((resolve) => setTimeout(resolve, 100));
    AndroidDebugger.markEnd('flow_cleanup');

    AndroidDebugger.markEnd('full_flow');
    addResult('Multi-step flow completed (4 steps)');
    setLoading(null);
  };

  const clearResults = () => setResults([]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Measurements</Text>
        <Text style={styles.sectionDescription}>
          Use markStart() and markEnd() to measure operation duration.
        </Text>

        <ActionButton title="Sync Calculation" onPress={handleSyncOperation} icon="calculator" />
        <ActionButton
          title="Async Delay (1.5s)"
          onPress={handleAsyncDelay}
          icon="time"
          variant="secondary"
          loading={loading === 'delay'}
        />
        <ActionButton
          title="API Call"
          onPress={handleApiCall}
          icon="cloud-download"
          variant="secondary"
          loading={loading === 'api'}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nested Measurements</Text>

        <ActionButton
          title="Multiple API Calls"
          onPress={handleMultipleApis}
          icon="git-branch"
          loading={loading === 'multi-api'}
        />
        <ActionButton
          title="Data Processing Pipeline"
          onPress={handleDataProcessing}
          icon="funnel"
          variant="secondary"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Complex Operations</Text>

        <ActionButton
          title="Render Simulation"
          onPress={handleComponentRender}
          icon="browsers"
          variant="secondary"
        />
        <ActionButton
          title="Memory Intensive"
          onPress={handleMemoryIntensive}
          icon="hardware-chip"
          variant="secondary"
          loading={loading === 'memory'}
        />
        <ActionButton
          title="Multi-Step Flow"
          onPress={handleMultiStepFlow}
          icon="git-merge"
          variant="secondary"
          loading={loading === 'flow'}
        />
      </View>

      <ResultDisplay title="Measurement History" results={results} />

      {results.length > 0 && (
        <ActionButton title="Clear History" onPress={clearResults} variant="secondary" icon="trash" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 16,
    lineHeight: 20,
  },
});
