import React, { useState } from 'react';
import type { TimelineEventType, Device, RecordingSession } from '@android-debugger/shared';
import { useTimelineContext } from '../../contexts/TimelineContext';
import { useRecordingContext } from '../../contexts/RecordingContext';

interface TimelineHeaderProps {
  device: Device | null;
  packageName: string;
}

const filterLabels: Record<TimelineEventType, string> = {
  log: 'Log',
  crash: 'Crash',
  console: 'Console',
  network: 'Network',
  state: 'State',
  custom: 'Custom',
  zustand: 'Zustand',
  websocket: 'WebSocket',
  memory: 'Memory',
  cpu: 'CPU',
  fps: 'FPS',
  battery: 'Battery',
  activity: 'Activity',
};

const primaryFilters: TimelineEventType[] = ['log', 'crash', 'console', 'network', 'state', 'custom'];
const perfFilters: TimelineEventType[] = ['memory', 'cpu', 'fps', 'battery'];
const advancedFilters: TimelineEventType[] = ['zustand', 'websocket', 'activity'];

export function TimelineHeader({ device, packageName }: TimelineHeaderProps) {
  const { filters, setFilter, clearEvents, isLive, filteredEvents } = useTimelineContext();
  const { isRecording, currentSession, sessions, startRecording, stopRecording, loadSession, goLive } = useRecordingContext();
  const [showFilters, setShowFilters] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [recordingName, setRecordingName] = useState('');
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);

  const handleStartRecording = () => {
    if (!device) return;
    setShowRecordingDialog(true);
  };

  const handleConfirmRecording = () => {
    if (!device) return;
    const name = recordingName.trim() || `Recording ${new Date().toLocaleString()}`;
    startRecording(name, device, packageName);
    setRecordingName('');
    setShowRecordingDialog(false);
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  const handleLoadSession = (session: RecordingSession) => {
    loadSession(session.id);
    setShowSessions(false);
  };

  const renderFilterButton = (type: TimelineEventType) => (
    <button
      key={type}
      onClick={() => setFilter(type, !filters[type])}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        filters[type]
          ? 'bg-accent-muted text-accent'
          : 'bg-surface-elevated text-text-muted hover:text-text-primary'
      }`}
    >
      {filterLabels[type]}
    </button>
  );

  return (
    <div className="flex flex-col gap-2 p-4 border-b border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isLive ? (
            <>
              {isRecording ? (
                <button
                  onClick={handleStopRecording}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Stop Recording
                </button>
              ) : (
                <button
                  onClick={handleStartRecording}
                  disabled={!device}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  Record
                </button>
              )}
              <div className="flex items-center gap-1.5 text-sm text-green-400">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Live
              </div>
            </>
          ) : (
            <button
              onClick={goLive}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
            >
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Go Live
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated rounded-lg hover:bg-surface-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Sessions
            </button>

            {showSessions && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-surface-elevated border border-border rounded-lg shadow-lg z-10 max-h-64 overflow-auto">
                {sessions.length === 0 ? (
                  <div className="p-4 text-sm text-text-muted text-center">No saved sessions</div>
                ) : (
                  sessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => handleLoadSession(session)}
                      className="w-full p-3 text-left hover:bg-surface-hover transition-colors border-b border-border last:border-b-0"
                    >
                      <div className="text-sm text-text-primary font-medium truncate">{session.name}</div>
                      <div className="text-xs text-text-muted">
                        {new Date(session.createdAt).toLocaleString()} - {session.eventCount} events
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted">{filteredEvents.length} events</span>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              showFilters ? 'bg-accent-muted text-accent' : 'bg-surface-elevated hover:bg-surface-hover'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>

          <button
            onClick={clearEvents}
            className="px-3 py-1.5 bg-surface-elevated rounded-lg hover:bg-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs text-text-muted uppercase font-medium">Filters:</span>
          {primaryFilters.map(renderFilterButton)}
          <span className="w-px h-4 bg-border mx-1" />
          {advancedFilters.map(renderFilterButton)}
          <span className="w-px h-4 bg-border mx-1" />
          <span className="text-xs text-text-muted">Perf:</span>
          {perfFilters.map(renderFilterButton)}
        </div>
      )}

      {isRecording && currentSession && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-red-400">Recording: {currentSession.name}</span>
          <span className="text-xs text-red-400/70">
            ({Math.floor((Date.now() - currentSession.startTime) / 1000)}s)
          </span>
        </div>
      )}

      {showRecordingDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated border border-border rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Start Recording</h3>
            <input
              type="text"
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              placeholder="Recording name (optional)"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowRecordingDialog(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRecording}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
