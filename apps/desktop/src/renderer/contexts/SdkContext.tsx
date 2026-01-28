import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { SdkMessage, ConsoleMessage, CustomEvent, StateSnapshot, NetworkRequest } from '@android-debugger/shared';

interface ConsoleLine {
  id: string;
  level: ConsoleMessage['level'];
  message: string;
  timestamp: number;
}

interface SdkContextValue {
  // SDK data
  consoleLogs: ConsoleLine[];
  events: CustomEvent[];
  states: StateSnapshot[];

  // Network data
  requests: NetworkRequest[];
  selectedRequest: NetworkRequest | null;

  // Actions
  clearConsoleLogs: () => void;
  clearEvents: () => void;
  clearStates: () => void;
  clearRequests: () => void;
  setSelectedRequest: (request: NetworkRequest | null) => void;
}

const SdkContext = createContext<SdkContextValue | null>(null);

export function useSdkContext() {
  const context = useContext(SdkContext);
  if (!context) {
    throw new Error('useSdkContext must be used within SdkProvider');
  }
  return context;
}

interface SdkProviderProps {
  children: ReactNode;
}

export function SdkProvider({ children }: SdkProviderProps) {
  // SDK data
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([]);
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [states, setStates] = useState<StateSnapshot[]>([]);

  // Network data
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(null);

  // Clear functions
  const clearConsoleLogs = useCallback(() => setConsoleLogs([]), []);
  const clearEvents = useCallback(() => setEvents([]), []);
  const clearStates = useCallback(() => setStates([]), []);
  const clearRequests = useCallback(() => {
    setRequests([]);
    setSelectedRequest(null);
  }, []);

  // Listen for SDK messages from logcat
  // SDK messages are automatically parsed from logcat when logcat is running
  useEffect(() => {
    const unsubscribeMessage = window.electronAPI.onSdkMessage(({ message }: { message: SdkMessage }) => {
      switch (message.type) {
        case 'console': {
          const consoleMsg = message.payload as ConsoleMessage;
          setConsoleLogs((prev) => [
            ...prev.slice(-999),
            {
              id: `${Date.now()}-${Math.random()}`,
              level: consoleMsg.level,
              message: consoleMsg.args.map((arg) =>
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
              ).join(' '),
              timestamp: consoleMsg.timestamp,
            },
          ]);
          break;
        }
        case 'custom': {
          const event = message.payload as CustomEvent;
          setEvents((prev) => [...prev.slice(-99), event]);
          break;
        }
        case 'state': {
          const state = message.payload as StateSnapshot;
          setStates((prev) => {
            const existing = prev.findIndex((s) => s.name === state.name);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = state;
              return updated;
            }
            return [...prev, state];
          });
          break;
        }
        case 'network': {
          const request = message.payload as NetworkRequest;
          setRequests((prev) => {
            const existingIndex = prev.findIndex((r) => r.id === request.id);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = request;
              return updated;
            }
            return [...prev, request];
          });
          break;
        }
      }
    });

    return () => {
      unsubscribeMessage();
    };
  }, []);

  const value: SdkContextValue = {
    consoleLogs,
    events,
    states,
    requests,
    selectedRequest,
    clearConsoleLogs,
    clearEvents,
    clearStates,
    clearRequests,
    setSelectedRequest,
  };

  return <SdkContext.Provider value={value}>{children}</SdkContext.Provider>;
}
