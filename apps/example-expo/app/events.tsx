import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import { ActionButton, ResultDisplay, ConnectionStatus } from '@yemirhan/android-debugger-ui';

export default function EventsScreen() {
  const [results, setResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setResults((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleSimpleEvent = () => {
    AndroidDebugger.trackEvent('button_click');
    addResult('Sent: button_click (no data)');
  };

  const handleEventWithString = () => {
    AndroidDebugger.trackEvent('page_view', { page: 'events' });
    addResult('Sent: page_view with page data');
  };

  const handleUserAction = () => {
    AndroidDebugger.trackEvent('user_action', {
      action: 'purchase',
      productId: 'prod_123',
      amount: 29.99,
      currency: 'USD',
    });
    addResult('Sent: user_action (purchase event)');
  };

  const handleFormSubmit = () => {
    AndroidDebugger.trackEvent('form_submit', {
      formId: 'contact_form',
      fields: ['name', 'email', 'message'],
      isValid: true,
      submittedAt: new Date().toISOString(),
    });
    addResult('Sent: form_submit with form data');
  };

  const handleNavigation = () => {
    AndroidDebugger.trackEvent('navigation', {
      from: '/events',
      to: '/home',
      method: 'button_press',
      params: { ref: 'sidebar' },
    });
    addResult('Sent: navigation event');
  };

  const handleErrorEvent = () => {
    AndroidDebugger.trackEvent('error_occurred', {
      code: 'ERR_NETWORK',
      message: 'Failed to fetch data',
      stack: 'Error: Failed to fetch\n  at fetchData (app.js:42)',
      context: {
        url: '/api/data',
        retryCount: 3,
      },
    });
    addResult('Sent: error_occurred with error details');
  };

  const handlePerformanceEvent = () => {
    AndroidDebugger.trackEvent('performance_metric', {
      metric: 'ttfb',
      value: 234,
      unit: 'ms',
      url: '/api/posts',
    });
    addResult('Sent: performance_metric');
  };

  const handleBatchEvents = () => {
    AndroidDebugger.trackEvent('session_start', { sessionId: 'sess_abc123' });
    AndroidDebugger.trackEvent('feature_used', { feature: 'dark_mode', enabled: true });
    AndroidDebugger.trackEvent('session_end', { duration: 120000 });
    addResult('Sent: 3 events (session_start, feature_used, session_end)');
  };

  const clearResults = () => setResults([]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Events</Text>
        <Text style={styles.sectionDescription}>
          Use trackEvent() to send custom events with optional data payloads.
        </Text>

        <ActionButton title="Simple Event" onPress={handleSimpleEvent} icon="flash" />
        <ActionButton
          title="Page View"
          onPress={handleEventWithString}
          icon="eye"
          variant="secondary"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rich Event Data</Text>

        <ActionButton title="User Purchase" onPress={handleUserAction} icon="cart" />
        <ActionButton
          title="Form Submit"
          onPress={handleFormSubmit}
          icon="document"
          variant="secondary"
        />
        <ActionButton
          title="Navigation"
          onPress={handleNavigation}
          icon="navigate"
          variant="secondary"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Advanced Events</Text>

        <ActionButton
          title="Error Event"
          onPress={handleErrorEvent}
          icon="alert-circle"
          variant="danger"
        />
        <ActionButton
          title="Performance Metric"
          onPress={handlePerformanceEvent}
          icon="speedometer"
          variant="secondary"
        />
        <ActionButton
          title="Batch Events (3)"
          onPress={handleBatchEvents}
          icon="layers"
          variant="secondary"
        />
      </View>

      <ResultDisplay title="Sent Events" results={results} />

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
