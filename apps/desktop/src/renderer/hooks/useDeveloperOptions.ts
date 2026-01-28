import { useState, useEffect, useCallback } from 'react';
import type { Device, DeveloperOptions } from '@android-debugger/shared';

export function useDeveloperOptions(device: Device | null) {
  const [options, setOptions] = useState<DeveloperOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    if (!device) {
      setOptions(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getDeveloperOptions(device.id);
      setOptions(result);
      if (!result) {
        setError('Failed to fetch developer options');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, [device]);

  const refresh = useCallback(() => {
    fetchOptions();
  }, [fetchOptions]);

  // Fetch options when device changes
  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const setLayoutBounds = useCallback(
    async (enabled: boolean) => {
      if (!device) return false;

      setUpdating(true);
      setError(null);

      try {
        const success = await window.electronAPI.setLayoutBounds(device.id, enabled);
        if (success) {
          setOptions((prev) => (prev ? { ...prev, layoutBounds: enabled } : null));
        } else {
          setError('Failed to set layout bounds');
        }
        return success;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [device]
  );

  const setGpuOverdraw = useCallback(
    async (mode: DeveloperOptions['gpuOverdraw']) => {
      if (!device) return false;

      setUpdating(true);
      setError(null);

      try {
        const success = await window.electronAPI.setGpuOverdraw(device.id, mode);
        if (success) {
          setOptions((prev) => (prev ? { ...prev, gpuOverdraw: mode } : null));
        } else {
          setError('Failed to set GPU overdraw');
        }
        return success;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [device]
  );

  const setAnimationScale = useCallback(
    async (scale: number, type: 'window' | 'transition' | 'animator') => {
      if (!device) return false;

      setUpdating(true);
      setError(null);

      try {
        const success = await window.electronAPI.setAnimationScale(device.id, scale, type);
        if (success) {
          setOptions((prev) => {
            if (!prev) return null;
            const key =
              type === 'window'
                ? 'windowAnimationScale'
                : type === 'transition'
                  ? 'transitionAnimationScale'
                  : 'animatorDurationScale';
            return { ...prev, [key]: scale };
          });
        } else {
          setError('Failed to set animation scale');
        }
        return success;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [device]
  );

  const setShowTouches = useCallback(
    async (enabled: boolean) => {
      if (!device) return false;

      setUpdating(true);
      setError(null);

      try {
        const success = await window.electronAPI.setShowTouches(device.id, enabled);
        if (success) {
          setOptions((prev) => (prev ? { ...prev, showTouches: enabled } : null));
        } else {
          setError('Failed to set show touches');
        }
        return success;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [device]
  );

  const setPointerLocation = useCallback(
    async (enabled: boolean) => {
      if (!device) return false;

      setUpdating(true);
      setError(null);

      try {
        const success = await window.electronAPI.setPointerLocation(device.id, enabled);
        if (success) {
          setOptions((prev) => (prev ? { ...prev, pointerLocation: enabled } : null));
        } else {
          setError('Failed to set pointer location');
        }
        return success;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [device]
  );

  return {
    options,
    loading,
    updating,
    error,
    refresh,
    setLayoutBounds,
    setGpuOverdraw,
    setAnimationScale,
    setShowTouches,
    setPointerLocation,
  };
}
