import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { theme } from '../theme';

export interface ResultDisplayProps {
  title: string;
  results: string[];
  maxHeight?: number;
}

export function ResultDisplay({ title, results, maxHeight = 200 }: ResultDisplayProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView style={[styles.scrollView, { maxHeight }]}>
        {results.map((result, index) => (
          <Text key={index} style={styles.resultText}>
            {result}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  scrollView: {
    flexGrow: 0,
  },
  resultText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    marginBottom: 4,
    lineHeight: 18,
  },
});
