import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FeatureCard, ConnectionStatus } from '@/components';
import { useConnection } from './_layout';

export default function HomeScreen() {
  const { isConnected } = useConnection();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus isConnected={isConnected} />

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

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Make sure the Android Debugger desktop app is running and update the host IP in
          app/_layout.tsx to your computer's IP address.
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
