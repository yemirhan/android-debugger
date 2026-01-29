import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, ResultDisplay, ConnectionStatus } from '@yemirhan/android-debugger-ui';

export default function ConsoleScreen() {
  const [results, setResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setResults((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleLog = () => {
    console.log('Simple log message');
    addResult('Sent: console.log("Simple log message")');
  };

  const handleLogWithData = () => {
    console.log('User data:', { id: 1, name: 'John Doe', email: 'john@example.com' });
    addResult('Sent: console.log with user object');
  };

  const handleWarn = () => {
    console.warn('This is a warning message');
    addResult('Sent: console.warn("This is a warning message")');
  };

  const handleError = () => {
    console.error('Something went wrong!', new Error('Example error'));
    addResult('Sent: console.error with Error object');
  };

  const handleNestedData = () => {
    console.log('Complex nested data:', {
      users: [
        { id: 1, name: 'Alice', roles: ['admin', 'user'] },
        { id: 2, name: 'Bob', roles: ['user'] },
      ],
      metadata: {
        total: 2,
        page: 1,
        timestamp: Date.now(),
      },
    });
    addResult('Sent: console.log with nested arrays and objects');
  };

  const handleMultipleArgs = () => {
    console.log('Multiple', 'arguments', 123, true, { key: 'value' });
    addResult('Sent: console.log with multiple arguments');
  };

  const handleDebug = () => {
    console.debug('Debug message for development');
    addResult('Sent: console.debug("Debug message for development")');
  };

  const handleInfo = () => {
    console.info('Informational message');
    addResult('Sent: console.info("Informational message")');
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Logging</Text>
        <Text style={styles.sectionDescription}>
          Test different console methods. All logs are intercepted and sent to the debugger.
        </Text>

        <ActionButton title="console.log()" onPress={handleLog} icon="chatbubble" />
        <ActionButton title="console.log() with object" onPress={handleLogWithData} icon="code" />
        <ActionButton
          title="console.warn()"
          onPress={handleWarn}
          icon="warning"
          variant="secondary"
        />
        <ActionButton title="console.error()" onPress={handleError} icon="close-circle" variant="danger" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Advanced Logging</Text>

        <ActionButton title="Nested objects/arrays" onPress={handleNestedData} icon="git-branch" />
        <ActionButton
          title="Multiple arguments"
          onPress={handleMultipleArgs}
          icon="list"
          variant="secondary"
        />
        <ActionButton
          title="console.debug()"
          onPress={handleDebug}
          icon="bug"
          variant="secondary"
        />
        <ActionButton
          title="console.info()"
          onPress={handleInfo}
          icon="information-circle"
          variant="secondary"
        />
      </View>

      <ResultDisplay title="Log History" results={results} />

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
