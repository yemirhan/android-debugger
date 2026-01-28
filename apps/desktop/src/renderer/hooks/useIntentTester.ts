import { useState, useEffect, useCallback } from 'react';
import type { Device, IntentConfig, IntentHistoryEntry, IntentExtra } from '@android-debugger/shared';

const createEmptyIntent = (): IntentConfig => ({
  id: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: '',
  action: 'android.intent.action.VIEW',
  data: '',
  type: '',
  category: '',
  component: '',
  extras: [],
  flags: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function useIntentTester(device: Device | null) {
  const [currentIntent, setCurrentIntent] = useState<IntentConfig>(createEmptyIntent());
  const [savedIntents, setSavedIntents] = useState<IntentConfig[]>([]);
  const [history, setHistory] = useState<IntentHistoryEntry[]>([]);
  const [deepLinkUri, setDeepLinkUri] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Load saved intents and history on mount
  useEffect(() => {
    loadSavedIntents();
    loadHistory();
  }, []);

  const loadSavedIntents = useCallback(async () => {
    try {
      const intents = await window.electronAPI.getSavedIntents();
      setSavedIntents(intents);
    } catch (err) {
      console.error('Failed to load saved intents:', err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const historyData = await window.electronAPI.getIntentHistory();
      setHistory(historyData);
    } catch (err) {
      console.error('Failed to load intent history:', err);
    }
  }, []);

  const fireIntent = useCallback(async () => {
    if (!device) {
      setError('No device connected');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.fireIntent(device.id, currentIntent);
      setLastResult(result);
      if (!result.success) {
        setError(result.error || 'Intent failed');
      }
      // Reload history
      loadHistory();
      return result.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setLastResult({ success: false, error: message });
      return false;
    } finally {
      setLoading(false);
    }
  }, [device, currentIntent, loadHistory]);

  const fireDeepLink = useCallback(async () => {
    if (!device) {
      setError('No device connected');
      return false;
    }

    if (!deepLinkUri) {
      setError('Please enter a URI');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.fireDeepLink(device.id, deepLinkUri);
      setLastResult(result);
      if (!result.success) {
        setError(result.error || 'Deep link failed');
      }
      // Reload history
      loadHistory();
      return result.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setLastResult({ success: false, error: message });
      return false;
    } finally {
      setLoading(false);
    }
  }, [device, deepLinkUri, loadHistory]);

  const saveCurrentIntent = useCallback(async () => {
    if (!currentIntent.name) {
      setError('Please enter a name for the intent');
      return false;
    }

    try {
      const intentToSave = {
        ...currentIntent,
        updatedAt: Date.now(),
      };
      await window.electronAPI.saveIntent(intentToSave);
      loadSavedIntents();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save intent');
      return false;
    }
  }, [currentIntent, loadSavedIntents]);

  const deleteSavedIntent = useCallback(
    async (id: string) => {
      try {
        await window.electronAPI.deleteSavedIntent(id);
        loadSavedIntents();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete intent');
      }
    },
    [loadSavedIntents]
  );

  const loadSavedIntent = useCallback((intent: IntentConfig) => {
    setCurrentIntent({ ...intent });
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await window.electronAPI.clearIntentHistory();
      setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history');
    }
  }, []);

  const resetIntent = useCallback(() => {
    setCurrentIntent(createEmptyIntent());
    setError(null);
    setLastResult(null);
  }, []);

  const updateIntent = useCallback((updates: Partial<IntentConfig>) => {
    setCurrentIntent((prev) => ({ ...prev, ...updates, updatedAt: Date.now() }));
  }, []);

  const addExtra = useCallback((extra: IntentExtra) => {
    setCurrentIntent((prev) => ({
      ...prev,
      extras: [...prev.extras, extra],
      updatedAt: Date.now(),
    }));
  }, []);

  const removeExtra = useCallback((index: number) => {
    setCurrentIntent((prev) => ({
      ...prev,
      extras: prev.extras.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    }));
  }, []);

  const updateExtra = useCallback((index: number, extra: IntentExtra) => {
    setCurrentIntent((prev) => ({
      ...prev,
      extras: prev.extras.map((e, i) => (i === index ? extra : e)),
      updatedAt: Date.now(),
    }));
  }, []);

  return {
    currentIntent,
    savedIntents,
    history,
    deepLinkUri,
    setDeepLinkUri,
    loading,
    error,
    lastResult,
    fireIntent,
    fireDeepLink,
    saveCurrentIntent,
    deleteSavedIntent,
    loadSavedIntent,
    clearHistory,
    resetIntent,
    updateIntent,
    addExtra,
    removeExtra,
    updateExtra,
  };
}
