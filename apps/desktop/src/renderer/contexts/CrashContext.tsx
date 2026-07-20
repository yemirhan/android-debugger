import React, { createContext, useContext, ReactNode } from 'react';
import type { CrashEntry, Device } from '@android-debugger/shared';
import { useCrashLogcat } from '../hooks/useCrashLogcat';

interface CrashContextType {
  crashes: CrashEntry[];
  isMonitoring: boolean;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  clearCrashes: () => void;
}

const CrashContext = createContext<CrashContextType | null>(null);

interface CrashProviderProps {
  children: ReactNode;
  device: Device | null;
}

export function CrashProvider({ children, device }: CrashProviderProps) {
  const { crashes, isMonitoring, startMonitoring, stopMonitoring, clearCrashes } = useCrashLogcat(device);

  return (
    <CrashContext.Provider
      value={{
        crashes,
        isMonitoring,
        startMonitoring,
        stopMonitoring,
        clearCrashes,
      }}
    >
      {children}
    </CrashContext.Provider>
  );
}

export function useCrashContext() {
  const context = useContext(CrashContext);
  if (!context) {
    throw new Error('useCrashContext must be used within a CrashProvider');
  }
  return context;
}
