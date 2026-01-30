import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FeatureCard, ConnectionStatus } from '@yemirhan/android-debugger-ui';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus />

      <View style={styles.header}>
        <Text style={styles.title}>SDK Feature Demos</Text>
        <Text style={styles.subtitle}>
          Tap on a feature to explore and test the Android Debugger SDK capabilities
        </Text>
      </View>

      <FeatureCard
        title="Console"
        description="Log messages, warnings, and errors"
        icon="terminal"
        href="/console"
      />

      <FeatureCard
        title="Network"
        description="Track fetch and axios requests"
        icon="globe"
        href="/network"
      />

      <FeatureCard
        title="Custom Events"
        description="Send custom tracking events"
        icon="flash"
        href="/events"
      />

      <FeatureCard
        title="State Snapshots"
        description="Capture and send state data"
        icon="camera"
        href="/state"
      />

      <FeatureCard
        title="Performance"
        description="Measure execution timing"
        icon="speedometer"
        href="/performance"
      />

      <FeatureCard
        title="Redux"
        description="Track Redux actions and state"
        icon="layers"
        href="/redux"
      />

      <FeatureCard
        title="Zustand"
        description="Track Zustand store state changes"
        icon="archive"
        href="/zustand"
      />

      <FeatureCard
        title="WebSocket"
        description="Monitor WebSocket connections and messages"
        icon="flash"
        href="/websocket"
      />

      <View style={styles.crashSection}>
        <Text style={styles.crashLabel}>Crash testing</Text>
        <Pressable
          onPress={() => {
            setTimeout(() => {
              throw new Error('Manual crash triggered');
            }, 0);
          }}
          style={({ pressed }) => [
            styles.crashButton,
            pressed && styles.crashButtonPressed,
          ]}
        >
          <Text style={styles.crashButtonText}>Crash the app</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          SDK messages are sent via logcat and captured by the desktop app through ADB.
          No IP address or port configuration needed!
        </Text>
      </View>
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
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
    lineHeight: 20,
  },
  crashSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  crashLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fca5a5',
    marginBottom: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  crashButton: {
    alignItems: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  crashButtonPressed: {
    backgroundColor: '#b91c1c',
  },
  crashButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  footerText: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
});
