import { useState, useEffect, useCallback, useRef } from 'react';
import type { Device, SharedPreference } from '@android-debugger/shared';

export function useSharedPreferences(device: Device | null, packageName: string) {
  const [preferences, setPreferences] = useState<SharedPreference[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const deviceId = device?.id;

  const fetchPreferences = useCallback(async () => {
    // Invalidate any in-flight request for a previous device/package.
    const requestId = ++requestIdRef.current;

    if (!deviceId || !packageName) {
      setPreferences([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.readSharedPrefs(deviceId, packageName);
      if (requestId !== requestIdRef.current) return;
      setPreferences(result);
      // Keep the current selection if it still exists, otherwise pick the first file.
      setSelectedFile((prev) =>
        prev && result.some((p) => p.file === prev) ? prev : result[0]?.file ?? null
      );
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to read SharedPreferences');
      setPreferences([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [deviceId, packageName]);

  const refresh = useCallback(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Reset and fetch preferences when device or package changes
  useEffect(() => {
    setPreferences([]);
    setSelectedFile(null);
    setError(null);
    fetchPreferences();
  }, [fetchPreferences]);

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
