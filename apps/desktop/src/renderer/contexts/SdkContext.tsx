import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { SdkMessage, ConsoleMessage, CustomEvent, StateSnapshot, NetworkRequest } from '@android-debugger/shared';
import { DEFAULT_WS_PORT } from '@android-debugger/shared';

interface ConsoleLine {
  id: string;
  level: ConsoleMessage['level'];
  message: string;
  timestamp: number;
}

interface SdkContextValue {
  // Server state
  port: number;
  isRunning: boolean;
  connectionCount: number;
  connections: Map<string, boolean>;

  // SDK data
  consoleLogs: ConsoleLine[];
  events: CustomEvent[];
  states: StateSnapshot[];

  // Network data
  requests: NetworkRequest[];
  selectedRequest: NetworkRequest | null;

  // Actions
  setPort: (port: number) => void;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
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
  // Server state
  const [port, setPort] = useState(DEFAULT_WS_PORT);
  const [isRunning, setIsRunning] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const [connections, setConnections] = useState<Map<string, boolean>>(new Map());

  // SDK data
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([]);
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [states, setStates] = useState<StateSnapshot[]>([]);

  // Network data
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(null);

  // Start server
  const startServer = useCallback(async () => {
    try {
      await window.electronAPI.startWsServer(port);
      setIsRunning(true);
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
    }
  }, [port]);

  // Stop server
  const stopServer = useCallback(async () => {
    try {
      await window.electronAPI.stopWsServer();
      setIsRunning(false);
      setConnectionCount(0);
      setConnections(new Map());
    } catch (error) {
      console.error('Failed to stop WebSocket server:', error);
    }
  }, []);

  // Clear functions
  const clearConsoleLogs = useCallback(() => setConsoleLogs([]), []);
  const clearEvents = useCallback(() => setEvents([]), []);
  const clearStates = useCallback(() => setStates([]), []);
  const clearRequests = useCallback(() => {
    setRequests([]);
    setSelectedRequest(null);
  }, []);

  // Listen for SDK messages and connections at app level
  useEffect(() => {
    const unsubscribeMessage = window.electronAPI.onSdkMessage(({ clientId, message }: { clientId: string; message: SdkMessage }) => {
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

    const unsubscribeConnection = window.electronAPI.onSdkConnection(({ clientId, connected }: { clientId: string; connected: boolean }) => {
      setConnections((prev) => {
        const updated = new Map(prev);
        if (connected) {
          updated.set(clientId, true);
        } else {
          updated.delete(clientId);
        }
        return updated;
      });
      setConnectionCount((prev) => prev + (connected ? 1 : -1));
    });

    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
    };
  }, []);

  const value: SdkContextValue = {
    port,
    isRunning,
    connectionCount,
    connections,
    consoleLogs,
    events,
    states,
    requests,
    selectedRequest,
    setPort,
    startServer,
    stopServer,
    clearConsoleLogs,
    clearEvents,
    clearStates,
    clearRequests,
    setSelectedRequest,
  };

  return <SdkContext.Provider value={value}>{children}</SdkContext.Provider>;
}
