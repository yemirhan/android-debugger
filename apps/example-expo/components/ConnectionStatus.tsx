import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <View style={[styles.container, isConnected ? styles.connected : styles.disconnected]}>
      <Ionicons
        name={isConnected ? 'checkmark-circle' : 'close-circle'}
        size={16}
        color={isConnected ? '#10b981' : '#ef4444'}
      />
      <Text style={[styles.text, isConnected ? styles.textConnected : styles.textDisconnected]}>
        {isConnected ? 'Connected to Debugger' : 'Disconnected'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 16,
  },
  connected: {
    backgroundColor: '#064e3b',
  },
  disconnected: {
    backgroundColor: '#7f1d1d',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
  textConnected: {
    color: '#10b981',
  },
  textDisconnected: {
    color: '#ef4444',
  },
});
