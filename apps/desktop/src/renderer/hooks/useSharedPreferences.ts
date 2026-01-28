import { useState, useEffect, useCallback } from 'react';
import type { Device, SharedPreference } from '@android-debugger/shared';

export function useSharedPreferences(device: Device | null, packageName: string) {
  const [preferences, setPreferences] = useState<SharedPreference[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!device || !packageName) {
      setPreferences([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.readSharedPrefs(device.id, packageName);
      setPreferences(result);
      if (result.length > 0 && !selectedFile) {
        setSelectedFile(result[0].file);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read SharedPreferences');
      setPreferences([]);
    } finally {
      setLoading(false);
    }
  }, [device, packageName, selectedFile]);

  const refresh = useCallback(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Fetch preferences when device or package changes
  useEffect(() => {
    fetchPreferences();
  }, [device?.id, packageName]);

  const getSelectedPreference = useCallback(() => {
    return preferences.find((p) => p.file === selectedFile) || null;
  }, [preferences, selectedFile]);

  return {
    preferences,
    selectedFile,
    setSelectedFile,
    selectedPreference: getSelectedPreference(),
    loading,
    error,
    refresh,
  };
}
