import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { TimelineEvent, RecordingSession, Device } from '@android-debugger/shared';
import { useTimelineContext } from './TimelineContext';

interface RecordingContextValue {
  isRecording: boolean;
  currentSession: RecordingSession | null;
  recordedEvents: TimelineEvent[];
  sessions: RecordingSession[];
  startRecording: (name: string, device: Device, packageName: string) => void;
  stopRecording: (notes?: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  goLive: () => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecordingContext() {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error('useRecordingContext must be used within RecordingProvider');
  }
  return context;
}

interface RecordingProviderProps {
  children: ReactNode;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function RecordingProvider({ children }: RecordingProviderProps) {
  const { subscribe, loadRecordedEvents, setIsLive, clearEvents } = useTimelineContext();

  const [isRecording, setIsRecording] = useState(false);
  const [currentSession, setCurrentSession] = useState<RecordingSession | null>(null);
  const [recordedEvents, setRecordedEvents] = useState<TimelineEvent[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<TimelineEvent[]>([]);

  // Load sessions on mount
  useEffect(() => {
    refreshSessions();
  }, []);

  // Refresh sessions list
  const refreshSessions = useCallback(async () => {
    try {
      const loadedSessions = await window.electronAPI.listRecordingSessions();
      setSessions(loadedSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }, []);

  // Start recording
  const startRecording = useCallback((name: string, device: Device, packageName: string) => {
    if (isRecording) return;

    const session: RecordingSession = {
      id: generateSessionId(),
      name,
      createdAt: Date.now(),
      startTime: Date.now(),
      endTime: 0,
      device: {
        id: device.id,
        model: device.model,
        androidVersion: device.androidVersion,
      },
      packageName,
      eventCount: 0,
    };

    setCurrentSession(session);
    setIsRecording(true);
    eventsRef.current = [];
    setRecordedEvents([]);

    // Subscribe to timeline events
    unsubscribeRef.current = subscribe((event: TimelineEvent) => {
      eventsRef.current.push(event);
      setRecordedEvents([...eventsRef.current]);
    });
  }, [isRecording, subscribe]);

  // Stop recording
  const stopRecording = useCallback(async (notes?: string) => {
    if (!isRecording || !currentSession) return;

    // Unsubscribe from timeline events
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Update session with end time and notes
    const finalSession: RecordingSession = {
      ...currentSession,
      endTime: Date.now(),
      notes,
      eventCount: eventsRef.current.length,
    };

    // Save session
    try {
      await window.electronAPI.saveRecordingSession(finalSession, eventsRef.current);
      await refreshSessions();
    } catch (error) {
      console.error('Failed to save recording session:', error);
    }

    setIsRecording(false);
    setCurrentSession(null);
  }, [isRecording, currentSession, refreshSessions]);

  // Load a recorded session
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const sessionWithEvents = await window.electronAPI.loadRecordingSession(sessionId);
      if (sessionWithEvents) {
        // Sort events by timestamp (oldest first for playback)
        const sortedEvents = [...sessionWithEvents.events].sort((a, b) => a.timestamp - b.timestamp);
        loadRecordedEvents(sortedEvents);
        setRecordedEvents(sortedEvents);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }, [loadRecordedEvents]);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await window.electronAPI.deleteRecordingSession(sessionId);
      await refreshSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [refreshSessions]);

  // Return to live mode
  const goLive = useCallback(() => {
    setIsLive(true);
    clearEvents();
    setRecordedEvents([]);
  }, [setIsLive, clearEvents]);

  const value: RecordingContextValue = {
    isRecording,
    currentSession,
    recordedEvents,
    sessions,
    startRecording,
    stopRecording,
    loadSession,
    deleteSession,
    refreshSessions,
    goLive,
  };

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}
