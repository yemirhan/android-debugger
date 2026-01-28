import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function ConnectionStatus() {
  return (
    <View style={styles.container}>
      <Ionicons
        name="radio"
        size={16}
        color="#10b981"
      />
      <Text style={styles.text}>
        SDK Active (via Logcat)
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
    backgroundColor: '#064e3b',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
    color: '#10b981',
  },
});
