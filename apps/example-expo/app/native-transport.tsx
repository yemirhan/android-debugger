import { useEffect, useState, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AndroidDebugger,
  isNativeTransportAvailable,
  getNativeTransportStatus,
} from '@yemirhan/android-debugger-native';
import type { Command } from '@yemirhan/android-debugger-sdk';

export default function NativeTransportScreen() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [status, setStatus] = useState<{
    available: boolean;
    running: boolean;
    connected: boolean;
    port: number;
  }>({
    available: false,
    running: false,
    connected: false,
    port: 0,
  });
  const [lastCommand, setLastCommand] = useState<Command | null>(null);
  const [eventsSent, setEventsSent] = useState(0);

  useEffect(() => {
    // Check availability
    setIsAvailable(isNativeTransportAvailable());

    // Get initial status
    setStatus(getNativeTransportStatus());

    // Listen for connection changes
    const unsubscribe = AndroidDebugger.onConnectionChange((connected) => {
      setStatus((prev) => ({ ...prev, connected }));
    });

    // Listen for incoming commands
    const unsubscribeCmd = AndroidDebugger.onCommand((cmd) => {
      setLastCommand(cmd);
    });

    // Refresh status periodically
    const interval = setInterval(() => {
      setStatus(getNativeTransportStatus());
    }, 2000);

    return () => {
      unsubscribe();
      unsubscribeCmd();
      clearInterval(interval);
    };
  }, []);

  const sendTestEvent = useCallback(() => {
    AndroidDebugger.trackEvent('native_transport_test', {
      timestamp: Date.now(),
      eventNumber: eventsSent + 1,
      transportType: status.connected ? 'socket' : 'logcat',
    });
    setEventsSent((prev) => prev + 1);
  }, [eventsSent, status.connected]);

  const sendLargePayload = useCallback(() => {
    // Generate a large payload to test socket transport
    const largeData = {
      timestamp: Date.now(),
      testType: 'large_payload',
      items: Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: `This is item number ${i} in the large payload test. Lorem ipsum dolor sit amet.`,
        values: Array.from({ length: 10 }, (_, j) => Math.random() * 1000),
      })),
    };

    AndroidDebugger.trackEvent('large_payload_test', largeData);
    setEventsSent((prev) => prev + 1);
  }, []);

  const sendStateSnapshot = useCallback(() => {
    AndroidDebugger.sendState('native_transport_test', {
      isAvailable,
      status,
      eventsSent,
      lastCommand,
      timestamp: Date.now(),
    });
  }, [isAvailable, status, eventsSent, lastCommand]);

  const StatusIndicator = ({ label, active }: { label: string; active: boolean }) => (
    <View style={styles.statusItem}>
      <View style={[styles.statusDot, active ? styles.statusActive : styles.statusInactive]} />
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transport Status</Text>
        <View style={styles.statusContainer}>
          <StatusIndicator label="Native Available" active={isAvailable} />
          <StatusIndicator label="Server Running" active={status.running} />
          <StatusIndicator label="Desktop Connected" active={status.connected} />
        </View>
        {status.port > 0 && (
          <Text style={styles.portText}>Port: {status.port}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transport Mode</Text>
        <View style={styles.transportMode}>
          <Text style={styles.transportModeText}>
            {status.connected ? 'Socket (Direct TCP)' : 'Logcat (ADB)'}
          </Text>
          <Text style={styles.transportModeDescription}>
            {status.connected
              ? 'Messages are sent directly via TCP socket for low latency and no size limits.'
              : 'Messages are sent via logcat and parsed by the desktop app.'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Test Actions</Text>

        <Pressable
          onPress={sendTestEvent}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Send Test Event</Text>
        </Pressable>

        <Pressable
          onPress={sendLargePayload}
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Send Large Payload (10KB+)</Text>
        </Pressable>

        <Pressable
          onPress={sendStateSnapshot}
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Send State Snapshot</Text>
        </Pressable>

        <Text style={styles.eventCount}>Events sent: {eventsSent}</Text>
      </View>

      {lastCommand && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last Command Received</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {JSON.stringify(lastCommand, null, 2)}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Native Transport</Text>
        <Text style={styles.infoText}>
          The native socket transport provides direct TCP communication between your app
          and the desktop debugger. Benefits include:
        </Text>
        <View style={styles.benefitsList}>
          <Text style={styles.benefitItem}>
            {'\u2022'} No logcat chunking for large payloads
          </Text>
          <Text style={styles.benefitItem}>
            {'\u2022'} Lower latency for state updates
          </Text>
          <Text style={styles.benefitItem}>
            {'\u2022'} Bi-directional command support
          </Text>
          <Text style={styles.benefitItem}>
            {'\u2022'} Automatic fallback to logcat when disconnected
          </Text>
        </View>
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
  section: {
    marginBottom: 24,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusActive: {
    backgroundColor: '#22c55e',
  },
  statusInactive: {
    backgroundColor: '#6b7280',
  },
  statusLabel: {
    fontSize: 14,
    color: '#d1d5db',
  },
  portText: {
    marginTop: 12,
    fontSize: 13,
    color: '#9ca3af',
  },
  transportMode: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
  },
  transportModeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#60a5fa',
    marginBottom: 4,
  },
  transportModeDescription: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonSecondary: {
    backgroundColor: '#4b5563',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  eventCount: {
    marginTop: 8,
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
  codeBlock: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#d1d5db',
  },
  infoText: {
    fontSize: 14,
    color: '#d1d5db',
    lineHeight: 20,
    marginBottom: 12,
  },
  benefitsList: {
    gap: 6,
  },
  benefitItem: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
});
