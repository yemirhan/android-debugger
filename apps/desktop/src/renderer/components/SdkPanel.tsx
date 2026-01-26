import React, { useState, useEffect, useCallback } from 'react';
import type { SdkMessage, ConsoleMessage, CustomEvent, StateSnapshot } from '@android-debugger/shared';
import { DEFAULT_WS_PORT } from '@android-debugger/shared';

interface Connection {
  clientId: string;
  connected: boolean;
}

interface ConsoleLine {
  id: string;
  level: ConsoleMessage['level'];
  message: string;
  timestamp: number;
}

export function SdkPanel() {
  const [port, setPort] = useState(DEFAULT_WS_PORT);
  const [isRunning, setIsRunning] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const [connections, setConnections] = useState<Map<string, boolean>>(new Map());
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([]);
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [states, setStates] = useState<StateSnapshot[]>([]);
  const [activeTab, setActiveTab] = useState<'console' | 'events' | 'state'>('console');

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

  // Listen for SDK messages
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
      }
    });

    const unsubscribeConnection = window.electronAPI.onSdkConnection(({ clientId, connected }: Connection) => {
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

  const clearConsoleLogs = () => setConsoleLogs([]);
  const clearEvents = () => setEvents([]);
  const clearStates = () => setStates([]);

  const getConsoleColor = (level: ConsoleMessage['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-amber-400';
      case 'info':
        return 'text-blue-400';
      case 'debug':
        return 'text-text-muted';
      default:
        return 'text-text-primary';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">SDK Connection</h2>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
              isRunning ? 'bg-green-500/10 border border-green-500/20' : 'bg-surface-hover'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-green-500 animate-pulse' : 'bg-text-muted'
              }`}
            />
            <span className={`text-xs ${isRunning ? 'text-green-400' : 'text-text-muted'}`}>
              {isRunning ? `Running on port ${port}` : 'Stopped'}
            </span>
          </div>
          {connectionCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <span className="text-xs text-violet-400">
                {connectionCount} client{connectionCount !== 1 ? 's' : ''} connected
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isRunning && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-secondary">Port:</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10))}
                className="w-20 px-2 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary outline-none focus:border-violet-500"
              />
            </div>
          )}
          <button
            onClick={isRunning ? stopServer : startServer}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
              isRunning
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {isRunning ? 'Stop Server' : 'Start Server'}
          </button>
        </div>
      </div>

      {/* Connection instructions */}
      {isRunning && connectionCount === 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-2">Connect your React Native app</h3>
          <pre className="bg-surface-hover rounded-lg p-3 text-xs font-mono text-text-secondary overflow-x-auto">
{`import { AndroidDebugger } from '@android-debugger/sdk';

AndroidDebugger.init({
  host: '<YOUR_IP_ADDRESS>',
  port: ${port},
});`}
          </pre>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('console')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'console'
              ? 'text-violet-400 border-violet-400'
              : 'text-text-muted border-transparent hover:text-text-primary'
          }`}
        >
          Console ({consoleLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'events'
              ? 'text-violet-400 border-violet-400'
              : 'text-text-muted border-transparent hover:text-text-primary'
          }`}
        >
          Events ({events.length})
        </button>
        <button
          onClick={() => setActiveTab('state')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'state'
              ? 'text-violet-400 border-violet-400'
              : 'text-text-muted border-transparent hover:text-text-primary'
          }`}
        >
          State ({states.length})
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
        {activeTab === 'console' && (
          <>
            <div className="flex items-center justify-end px-4 py-2 border-b border-border">
              <button
                onClick={clearConsoleLogs}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs">
              {consoleLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-text-muted">
                  No console logs captured
                </div>
              ) : (
                consoleLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`px-4 py-1.5 border-b border-border/50 ${getConsoleColor(log.level)}`}
                  >
                    <span className="text-text-muted mr-2">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className="font-medium mr-2">[{log.level.toUpperCase()}]</span>
                    <span className="whitespace-pre-wrap">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'events' && (
          <>
            <div className="flex items-center justify-end px-4 py-2 border-b border-border">
              <button
                onClick={clearEvents}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex items-center justify-center h-full text-text-muted">
                  No custom events captured
                </div>
              ) : (
                events.map((event, i) => (
                  <div key={i} className="px-4 py-3 border-b border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-violet-400">{event.name}</span>
                      <span className="text-xs text-text-muted">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="bg-surface-hover rounded p-2 text-xs font-mono text-text-secondary overflow-x-auto">
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
            <div className="flex items-center justify-end px-4 py-2 border-b border-border">
              <button
                onClick={clearStates}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {states.length === 0 ? (
                <div className="flex items-center justify-center h-full text-text-muted">
                  No state snapshots captured
                </div>
              ) : (
                states.map((state, i) => (
                  <div key={i} className="px-4 py-3 border-b border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-cyan-400">{state.name}</span>
                      <span className="text-xs text-text-muted">
                        {new Date(state.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="bg-surface-hover rounded p-2 text-xs font-mono text-text-secondary overflow-x-auto max-h-64">
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
