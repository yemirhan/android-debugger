import React, { useState } from 'react';
import type { ConsoleMessage } from '@android-debugger/shared';
import { useSdkContext } from '../contexts/SdkContext';

export function SdkPanel() {
  const {
    consoleLogs,
    events,
    states,
    clearConsoleLogs,
    clearEvents,
    clearStates,
  } = useSdkContext();

  const [activeTab, setActiveTab] = useState<'console' | 'events' | 'state'>('console');

  const getConsoleColor = (level: ConsoleMessage['level']) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-amber-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-text-muted';
      default: return 'text-text-primary';
    }
  };

  const tabs = [
    { id: 'console' as const, label: 'Console', count: consoleLogs.length },
    { id: 'events' as const, label: 'Events', count: events.length },
    { id: 'state' as const, label: 'State', count: states.length },
  ];

  const hasData = consoleLogs.length > 0 || events.length > 0 || states.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">SDK Data</h2>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
            <span className="text-xs font-mono text-accent">
              Listening via ADB
            </span>
          </div>
        </div>
      </div>

      {/* Info banner when no SDK data */}
      {!hasData && (
        <div className="bg-surface rounded-lg p-4 border border-border-muted animate-fade-in">
          <h3 className="text-sm font-medium text-text-primary mb-3">Add SDK to your React Native app</h3>
          <pre className="bg-background rounded-md p-3 text-xs font-mono text-text-secondary overflow-x-auto">
{`import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';

// Initialize the SDK (no host/port needed!)
AndroidDebugger.init();

// Optional: Track custom events
AndroidDebugger.trackEvent('user_action', { button: 'login' });

// Optional: Send state snapshots
AndroidDebugger.sendState('user', { name: 'John' });`}
          </pre>
          <p className="text-xs text-text-muted mt-3">
            SDK messages are automatically captured from logcat. Make sure logcat is running in the Logs panel.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border-muted w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
              activeTab === tab.id
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 ${activeTab === tab.id ? 'text-accent/70' : 'text-text-muted'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col">
        {activeTab === 'console' && (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-muted bg-surface-hover">
              <span className="text-xs text-text-muted">Console Output</span>
              <button
                onClick={clearConsoleLogs}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs">
              {consoleLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                  <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm">No console logs captured</p>
                  <p className="text-xs mt-1">Requires SDK in your app</p>
                </div>
              ) : (
                consoleLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`px-4 py-1.5 border-b border-border-muted/50 hover:bg-surface-hover/50 transition-colors ${getConsoleColor(log.level)}`}
                  >
                    <span className="text-text-muted mr-2">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className="font-semibold mr-2 uppercase">{log.level}</span>
                    <span className="whitespace-pre-wrap text-text-primary">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'events' && (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-muted bg-surface-hover">
              <span className="text-xs text-text-muted">Custom Events</span>
              <button
                onClick={clearEvents}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                  <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-sm">No custom events captured</p>
                  <p className="text-xs mt-1">Requires SDK in your app</p>
                </div>
              ) : (
                events.map((event, i) => (
                  <div key={i} className="px-4 py-3 border-b border-border-muted/50 hover:bg-surface-hover/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-accent">{event.name}</span>
                      <span className="text-xs text-text-muted font-mono">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="bg-surface-hover rounded-md p-2 text-xs font-mono text-text-secondary overflow-x-auto">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'state' && (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-muted bg-surface-hover">
              <span className="text-xs text-text-muted">State Snapshots</span>
              <button
                onClick={clearStates}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {states.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                  <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                  </div>
                  <p className="text-sm">No state snapshots captured</p>
                  <p className="text-xs mt-1">Requires SDK in your app</p>
                </div>
              ) : (
                states.map((state, i) => (
                  <div key={i} className="px-4 py-3 border-b border-border-muted/50 hover:bg-surface-hover/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-cyan-400">{state.name}</span>
                      <span className="text-xs text-text-muted font-mono">
                        {new Date(state.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="bg-surface-hover rounded-md p-2 text-xs font-mono text-text-secondary overflow-x-auto max-h-64">
                      {JSON.stringify(state.state, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
