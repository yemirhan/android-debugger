import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { SdkMessage, ConsoleMessage, CustomEvent, StateSnapshot, NetworkRequest, ZustandStoreSnapshot, WebSocketConnection, WebSocketMessage, WebSocketEvent } from '@android-debugger/shared';

interface ConsoleLine {
  id: string;
  level: ConsoleMessage['level'];
  message: string;
  timestamp: number;
}

interface WebSocketConnectionWithMessages extends WebSocketConnection {
  messages: WebSocketMessage[];
}

interface SdkContextValue {
  // SDK data
  consoleLogs: ConsoleLine[];
  events: CustomEvent[];
  states: StateSnapshot[];

  // Network data
  requests: NetworkRequest[];
  selectedRequest: NetworkRequest | null;

  // Zustand data
  zustandStores: Map<string, ZustandStoreSnapshot>;

  // WebSocket data
  wsConnections: Map<string, WebSocketConnectionWithMessages>;
  wsEvents: WebSocketEvent[];
  selectedWsConnection: string | null;

  // Actions
  clearConsoleLogs: () => void;
  clearEvents: () => void;
  clearStates: () => void;
  clearRequests: () => void;
  setSelectedRequest: (request: NetworkRequest | null) => void;
  clearZustandStores: () => void;
  clearWebSocket: () => void;
  setSelectedWsConnection: (connectionId: string | null) => void;
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

  // Zustand data
  const [zustandStores, setZustandStores] = useState<Map<string, ZustandStoreSnapshot>>(new Map());

  // WebSocket data
  const [wsConnections, setWsConnections] = useState<Map<string, WebSocketConnectionWithMessages>>(new Map());
  const [wsEvents, setWsEvents] = useState<WebSocketEvent[]>([]);
  const [selectedWsConnection, setSelectedWsConnection] = useState<string | null>(null);

  // Clear functions
  const clearConsoleLogs = useCallback(() => setConsoleLogs([]), []);
  const clearEvents = useCallback(() => setEvents([]), []);
  const clearStates = useCallback(() => setStates([]), []);
  const clearRequests = useCallback(() => {
    setRequests([]);
    setSelectedRequest(null);
  }, []);
  const clearZustandStores = useCallback(() => setZustandStores(new Map()), []);
  const clearWebSocket = useCallback(() => {
    setWsConnections(new Map());
    setWsEvents([]);
    setSelectedWsConnection(null);
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
        case 'zustand': {
          const snapshot = message.payload as ZustandStoreSnapshot;
          setZustandStores((prev) => {
            const newMap = new Map(prev);
            newMap.set(snapshot.name, snapshot);
            return newMap;
          });
          // Also add to states for backward compatibility
          setStates((prev) => {
            const existing = prev.findIndex((s) => s.name === `zustand:${snapshot.name}`);
            const stateSnapshot: StateSnapshot = {
              name: `zustand:${snapshot.name}`,
              state: snapshot.state,
              timestamp: snapshot.timestamp,
            };
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = stateSnapshot;
              return updated;
            }
            return [...prev, stateSnapshot];
          });
          break;
        }
        case 'websocket': {
          const payload = message.payload as {
            type: 'connection' | 'message' | 'event';
            connection?: WebSocketConnection;
            message?: WebSocketMessage;
            event?: WebSocketEvent;
            closeCode?: number;
            closeReason?: string;
          };

          if (payload.type === 'connection' && payload.connection) {
            setWsConnections((prev) => {
              const newMap = new Map(prev);
              newMap.set(payload.connection!.id, {
                ...payload.connection!,
                messages: [],
              });
              return newMap;
            });
          } else if (payload.type === 'message' && payload.message) {
            const msg = payload.message;
            setWsConnections((prev) => {
              const newMap = new Map(prev);
              const conn = newMap.get(msg.connectionId);
              if (conn) {
                newMap.set(msg.connectionId, {
                  ...conn,
                  messages: [...conn.messages.slice(-999), msg],
                });
              }
              return newMap;
            });
          } else if (payload.type === 'event' && payload.event) {
            setWsEvents((prev) => [...prev.slice(-99), payload.event!]);
            // Update connection state if provided
            if (payload.connection) {
              setWsConnections((prev) => {
                const newMap = new Map(prev);
                const existing = newMap.get(payload.connection!.id);
                if (existing) {
                  newMap.set(payload.connection!.id, {
                    ...existing,
                    ...payload.connection!,
                  });
                }
                return newMap;
              });
            }
          }
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
    zustandStores,
    wsConnections,
    wsEvents,
    selectedWsConnection,
    clearConsoleLogs,
    clearEvents,
    clearStates,
    clearRequests,
    setSelectedRequest,
    clearZustandStores,
    clearWebSocket,
    setSelectedWsConnection,
  };

  return <SdkContext.Provider value={value}>{children}</SdkContext.Provider>;
}
