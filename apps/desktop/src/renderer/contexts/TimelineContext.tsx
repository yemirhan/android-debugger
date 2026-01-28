import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react';
import type {
  TimelineEvent,
  TimelineEventType,
  TimelineSeverity,
  LogEntry,
  CrashEntry,
  SdkMessage,
  ConsoleMessage,
  NetworkRequest,
  CustomEvent,
  StateSnapshot,
  ZustandStoreSnapshot,
  WebSocketConnection,
  WebSocketMessage,
  MemoryInfo,
  CpuInfo,
  FpsInfo,
  BatteryInfo,
} from '@android-debugger/shared';
import { MAX_TIMELINE_EVENTS } from '@android-debugger/shared';

type FilterState = Record<TimelineEventType, boolean>;

interface TimelineContextValue {
  events: TimelineEvent[];
  filteredEvents: TimelineEvent[];
  filters: FilterState;
  setFilter: (type: TimelineEventType, enabled: boolean) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  selectedEvent: TimelineEvent | null;
  setSelectedEvent: (event: TimelineEvent | null) => void;
  clearEvents: () => void;
  isLive: boolean;
  setIsLive: (live: boolean) => void;
  loadRecordedEvents: (events: TimelineEvent[]) => void;
  subscribe: (callback: (event: TimelineEvent) => void) => () => void;
}

const defaultFilters: FilterState = {
  log: true,
  crash: true,
  console: true,
  network: true,
  state: true,
  custom: true,
  zustand: true,
  websocket: true,
  memory: false, // Off by default (too noisy)
  cpu: false,
  fps: false,
  battery: false,
  activity: true,
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

export function useTimelineContext() {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error('useTimelineContext must be used within TimelineProvider');
  }
  return context;
}

interface TimelineProviderProps {
  children: ReactNode;
}

// Helper to create a unique ID
function createEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to normalize log timestamp (ISO string) to Unix ms
function normalizeLogTimestamp(isoString: string): number {
  return new Date(isoString).getTime();
}

// Helper to determine severity from log level
function getLogSeverity(level: string): TimelineSeverity {
  switch (level) {
    case 'E':
    case 'F':
      return 'error';
    case 'W':
      return 'warning';
    default:
      return 'info';
  }
}

// Helper to determine severity from console level
function getConsoleSeverity(level: string): TimelineSeverity {
  switch (level) {
    case 'error':
      return 'error';
    case 'warn':
      return 'warning';
    default:
      return 'info';
  }
}

// Helper to determine severity from network status
function getNetworkSeverity(status?: number, error?: string): TimelineSeverity {
  if (error) return 'error';
  if (!status) return 'info';
  if (status >= 500) return 'error';
  if (status >= 400) return 'warning';
  return 'info';
}

export function TimelineProvider({ children }: TimelineProviderProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filters, setFiltersState] = useState<FilterState>(defaultFilters);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [isLive, setIsLive] = useState(true);

  // Subscribers for recording
  const subscribersRef = useRef<Set<(event: TimelineEvent) => void>>(new Set());

  // Subscribe to timeline events (used by recording)
  const subscribe = useCallback((callback: (event: TimelineEvent) => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  // Add event and notify subscribers
  const addEvent = useCallback((event: TimelineEvent) => {
    if (!isLive) return;

    setEvents((prev) => {
      const newEvents = [event, ...prev];
      if (newEvents.length > MAX_TIMELINE_EVENTS) {
        return newEvents.slice(0, MAX_TIMELINE_EVENTS);
      }
      return newEvents;
    });

    // Notify subscribers
    subscribersRef.current.forEach((callback) => callback(event));
  }, [isLive]);

  // Listen for log entries
  useEffect(() => {
    const unsubscribe = window.electronAPI.onLogEntry((entry: LogEntry) => {
      const event: TimelineEvent = {
        id: entry.id || createEventId(),
        timestamp: normalizeLogTimestamp(entry.timestamp),
        type: 'log',
        severity: getLogSeverity(entry.level),
        title: `[${entry.level}] ${entry.tag}`,
        subtitle: entry.message.length > 100 ? entry.message.substring(0, 100) + '...' : entry.message,
        data: entry,
      };
      addEvent(event);
    });

    return () => unsubscribe();
  }, [addEvent]);

  // Listen for crash entries
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCrashEntry((entry: CrashEntry) => {
      const event: TimelineEvent = {
        id: entry.id || createEventId(),
        timestamp: normalizeLogTimestamp(entry.timestamp),
        type: 'crash',
        severity: 'critical',
        title: `CRASH: ${entry.signal || 'Unknown'}`,
        subtitle: entry.processName,
        data: entry,
      };
      addEvent(event);
    });

    return () => unsubscribe();
  }, [addEvent]);

  // Listen for SDK messages
  useEffect(() => {
    const unsubscribe = window.electronAPI.onSdkMessage(({ message }: { message: SdkMessage }) => {
      let event: TimelineEvent | null = null;

      switch (message.type) {
        case 'console': {
          const consoleMsg = message.payload as ConsoleMessage;
          event = {
            id: createEventId(),
            timestamp: consoleMsg.timestamp,
            type: 'console',
            severity: getConsoleSeverity(consoleMsg.level),
            title: `console.${consoleMsg.level}`,
            subtitle: consoleMsg.args.map((arg) =>
              typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ').substring(0, 100),
            data: consoleMsg,
          };
          break;
        }
        case 'network': {
          const request = message.payload as NetworkRequest;
          const statusText = request.status ? ` ${request.status}` : '';
          const durationText = request.duration ? ` (${request.duration}ms)` : '';
          event = {
            id: createEventId(),
            timestamp: request.timestamp,
            type: 'network',
            severity: getNetworkSeverity(request.status, request.error),
            title: `${request.method} ${new URL(request.url).pathname}${statusText}`,
            subtitle: `${request.url}${durationText}`,
            data: request,
          };
          break;
        }
        case 'state': {
          const state = message.payload as StateSnapshot;
          event = {
            id: createEventId(),
            timestamp: state.timestamp,
            type: 'state',
            severity: 'info',
            title: `State: ${state.name}`,
            subtitle: JSON.stringify(state.state).substring(0, 80),
            data: state,
          };
          break;
        }
        case 'custom': {
          const customEvent = message.payload as CustomEvent;
          event = {
            id: createEventId(),
            timestamp: customEvent.timestamp,
            type: 'custom',
            severity: 'info',
            title: customEvent.name,
            subtitle: JSON.stringify(customEvent.data).substring(0, 80),
            data: customEvent,
          };
          break;
        }
        case 'zustand': {
          const snapshot = message.payload as ZustandStoreSnapshot;
          event = {
            id: createEventId(),
            timestamp: snapshot.timestamp,
            type: 'zustand',
            severity: 'info',
            title: `Zustand: ${snapshot.name}`,
            subtitle: 'State updated',
            data: snapshot,
          };
          break;
        }
        case 'websocket': {
          const payload = message.payload as {
            type: 'connection' | 'message' | 'event';
            connection?: WebSocketConnection;
            message?: WebSocketMessage;
          };

          if (payload.type === 'message' && payload.message) {
            const msg = payload.message;
            event = {
              id: msg.id || createEventId(),
              timestamp: msg.timestamp,
              type: 'websocket',
              severity: 'info',
              title: `WS ${msg.direction === 'sent' ? '>' : '<'} ${msg.type}`,
              subtitle: msg.data.substring(0, 80),
              data: msg,
            };
          } else if (payload.type === 'connection' && payload.connection) {
            event = {
              id: createEventId(),
              timestamp: payload.connection.openedAt || Date.now(),
              type: 'websocket',
              severity: 'info',
              title: `WS Connected`,
              subtitle: payload.connection.url,
              data: payload.connection,
            };
          }
          break;
        }
      }

      if (event) {
        addEvent(event);
      }
    });

    return () => unsubscribe();
  }, [addEvent]);

  // Listen for memory updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onMemoryUpdate((info: MemoryInfo) => {
      const event: TimelineEvent = {
        id: createEventId(),
        timestamp: info.timestamp,
        type: 'memory',
        severity: info.totalPss > 500 * 1024 ? 'warning' : 'info',
        title: `Memory: ${(info.totalPss / 1024).toFixed(1)} MB`,
        subtitle: `Heap: ${(info.javaHeap / 1024).toFixed(1)} MB`,
        data: info,
      };
      addEvent(event);
    });

    return () => unsubscribe();
  }, [addEvent]);

  // Listen for CPU updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCpuUpdate((info: CpuInfo) => {
      const event: TimelineEvent = {
        id: createEventId(),
        timestamp: info.timestamp,
        type: 'cpu',
        severity: info.usage > 80 ? 'warning' : 'info',
        title: `CPU: ${info.usage.toFixed(1)}%`,
        data: info,
      };
      addEvent(event);
    });

    return () => unsubscribe();
  }, [addEvent]);

  // Listen for FPS updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFpsUpdate((info: FpsInfo) => {
      const event: TimelineEvent = {
        id: createEventId(),
        timestamp: info.timestamp,
        type: 'fps',
        severity: info.fps < 30 ? 'warning' : 'info',
        title: `FPS: ${info.fps}`,
        subtitle: `Janky: ${info.jankyFrames}/${info.totalFrames}`,
        data: info,
      };
      addEvent(event);
    });

    return () => unsubscribe();
  }, [addEvent]);

  // Listen for battery updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.onBatteryUpdate((info: BatteryInfo) => {
      const event: TimelineEvent = {
        id: createEventId(),
        timestamp: info.timestamp,
        type: 'battery',
        severity: info.level < 20 ? 'warning' : 'info',
        title: `Battery: ${info.level}%`,
        subtitle: `${info.status} (${info.plugged})`,
        data: info,
      };
      addEvent(event);
    });

    return () => unsubscribe();
  }, [addEvent]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => filters[event.type]);
  }, [events, filters]);

  // Filter setters
  const setFilter = useCallback((type: TimelineEventType, enabled: boolean) => {
    setFiltersState((prev) => ({ ...prev, [type]: enabled }));
  }, []);

  const setFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
    setSelectedEvent(null);
  }, []);

  // Load recorded events (replaces live events)
  const loadRecordedEvents = useCallback((recordedEvents: TimelineEvent[]) => {
    setIsLive(false);
    setEvents(recordedEvents);
    setSelectedEvent(null);
  }, []);

  const value: TimelineContextValue = {
    events,
    filteredEvents,
    filters,
    setFilter,
    setFilters,
    selectedEvent,
    setSelectedEvent,
    clearEvents,
    isLive,
    setIsLive,
    loadRecordedEvents,
    subscribe,
  };

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}
