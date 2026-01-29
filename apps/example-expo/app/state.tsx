import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import { ActionButton, ResultDisplay, ConnectionStatus } from '@yemirhan/android-debugger-ui';

export default function StateScreen() {
  const [results, setResults] = useState<string[]>([]);
  const [counter, setCounter] = useState(0);
  const [user, setUser] = useState({ name: 'John Doe', email: 'john@example.com' });

  const addResult = (message: string) => {
    setResults((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleSimpleState = () => {
    AndroidDebugger.sendState('counter', { value: counter });
    addResult(`Sent state: counter = ${counter}`);
  };

  const handleUserState = () => {
    AndroidDebugger.sendState('user', user);
    addResult(`Sent state: user (${user.name})`);
  };

  const handleComplexState = () => {
    const appState = {
      auth: {
        isLoggedIn: true,
        user,
        token: 'jwt_token_example',
      },
      ui: {
        theme: 'dark',
        language: 'en',
        notifications: true,
      },
      data: {
        posts: [
          { id: 1, title: 'First Post' },
          { id: 2, title: 'Second Post' },
        ],
        loading: false,
        error: null,
      },
    };
    AndroidDebugger.sendState('app', appState);
    addResult('Sent state: full app state snapshot');
  };

  const handleSettingsState = () => {
    AndroidDebugger.sendState('settings', {
      appearance: {
        theme: 'dark',
        fontSize: 16,
        reducedMotion: false,
      },
      privacy: {
        analytics: true,
        crashReports: true,
        personalization: false,
      },
      notifications: {
        push: true,
        email: false,
        frequency: 'daily',
      },
    });
    addResult('Sent state: settings snapshot');
  };

  const handleFormState = () => {
    AndroidDebugger.sendState('form', {
      values: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 28,
        interests: ['coding', 'reading'],
      },
      touched: { name: true, email: true, age: false },
      errors: { email: null, name: null },
      isSubmitting: false,
      isValid: true,
    });
    addResult('Sent state: form state snapshot');
  };

  const handleCartState = () => {
    AndroidDebugger.sendState('cart', {
      items: [
        { id: 'prod_1', name: 'Widget', quantity: 2, price: 9.99 },
        { id: 'prod_2', name: 'Gadget', quantity: 1, price: 24.99 },
      ],
      subtotal: 44.97,
      tax: 3.60,
      total: 48.57,
      coupon: null,
    });
    addResult('Sent state: shopping cart snapshot');
  };

  const incrementCounter = () => {
    const newValue = counter + 1;
    setCounter(newValue);
    AndroidDebugger.sendState('counter', { value: newValue, previousValue: counter });
    addResult(`Counter incremented: ${counter} -> ${newValue}`);
  };

  const updateUser = () => {
    const updated = {
      ...user,
      name: user.name === 'John Doe' ? 'Jane Smith' : 'John Doe',
      updatedAt: new Date().toISOString(),
    };
    setUser(updated);
    AndroidDebugger.sendState('user', updated);
    addResult(`User updated to: ${updated.name}`);
  };

  const clearResults = () => setResults([]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>State Snapshots</Text>
        <Text style={styles.sectionDescription}>
          Use sendState() to capture and send state data to the debugger.
        </Text>

        <ActionButton title="Send Counter State" onPress={handleSimpleState} icon="analytics" />
        <ActionButton
          title="Send User State"
          onPress={handleUserState}
          icon="person"
          variant="secondary"
        />
        <ActionButton
          title="Send Full App State"
          onPress={handleComplexState}
          icon="albums"
          variant="secondary"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Example States</Text>

        <ActionButton
          title="Settings State"
          onPress={handleSettingsState}
          icon="settings"
          variant="secondary"
        />
        <ActionButton
          title="Form State"
          onPress={handleFormState}
          icon="create"
          variant="secondary"
        />
        <ActionButton title="Cart State" onPress={handleCartState} icon="cart" variant="secondary" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>State Changes</Text>
        <Text style={styles.sectionDescription}>
          Modify state and send updates to see changes in the debugger.
        </Text>

        <View style={styles.stateDisplay}>
          <Text style={styles.stateLabel}>Counter: {counter}</Text>
          <Text style={styles.stateLabel}>User: {user.name}</Text>
        </View>

        <ActionButton title="Increment & Send" onPress={incrementCounter} icon="add-circle" />
        <ActionButton
          title="Toggle User & Send"
          onPress={updateUser}
          icon="swap-horizontal"
          variant="secondary"
        />
      </View>

      <ResultDisplay title="State History" results={results} />

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
  stateDisplay: {
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  stateLabel: {
    fontSize: 14,
    color: '#d1d5db',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});
