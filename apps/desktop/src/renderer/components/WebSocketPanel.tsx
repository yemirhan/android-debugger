import React, { useState, useMemo } from 'react';
import { useSdkContext } from '../contexts/SdkContext';
import type { WebSocketMessage } from '@android-debugger/shared';

const WS_READY_STATE_LABELS: Record<number, string> = {
  0: 'Connecting',
  1: 'Open',
  2: 'Closing',
  3: 'Closed',
};

const WS_READY_STATE_COLORS: Record<number, string> = {
  0: 'text-amber-400 bg-amber-500/15',
  1: 'text-emerald-400 bg-emerald-500/15',
  2: 'text-orange-400 bg-orange-500/15',
  3: 'text-text-muted bg-surface-hover',
};

export function WebSocketPanel() {
  const { wsConnections, selectedWsConnection, setSelectedWsConnection, clearWebSocket } = useSdkContext();
  const [filterDirection, setFilterDirection] = useState<'all' | 'sent' | 'received'>('all');
  const [selectedMessage, setSelectedMessage] = useState<WebSocketMessage | null>(null);

  const connections = useMemo(() => Array.from(wsConnections.values()), [wsConnections]);

  const selectedConnection = useMemo(() => {
    if (!selectedWsConnection) return null;
    return wsConnections.get(selectedWsConnection) || null;
  }, [wsConnections, selectedWsConnection]);

  const filteredMessages = useMemo(() => {
    if (!selectedConnection) return [];
    return selectedConnection.messages.filter((msg) => {
      if (filterDirection === 'all') return true;
      return msg.direction === filterDirection;
    });
  }, [selectedConnection, filterDirection]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Connections sidebar */}
      <div className="w-64 bg-surface border-r border-border-muted flex flex-col">
        <div className="p-3 border-b border-border-muted flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Connections</h3>
          <button
            onClick={clearWebSocket}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            Clear All
          </button>
        </div>

        {connections.length > 0 ? (
          <div className="flex-1 overflow-auto">
            {connections.map((conn) => (
              <button
                key={conn.id}
                onClick={() => setSelectedWsConnection(conn.id)}
                className={`w-full px-3 py-2.5 text-left border-b border-border-muted transition-colors ${
                  selectedWsConnection === conn.id
                    ? 'bg-accent-muted'
                    : 'hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${WS_READY_STATE_COLORS[conn.readyState]}`}>
                    {WS_READY_STATE_LABELS[conn.readyState]}
                  </span>
                  <span className="text-xs text-text-muted">
                    {conn.messages.length} msg{conn.messages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs font-mono text-text-secondary truncate" title={conn.url}>
                  {conn.url}
                </p>
                {conn.protocol && (
                  <p className="text-xs text-text-muted mt-0.5">
                    Protocol: {conn.protocol}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center p-4">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-surface-hover flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </div>
              <p className="text-xs">No WebSocket connections</p>
              <p className="text-xs text-text-muted mt-1">
                Enable WebSocket interception in your app
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Messages panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedConnection ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-border-muted flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-text-primary truncate max-w-md" title={selectedConnection.url}>
                  {selectedConnection.url}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={filterDirection}
                  onChange={(e) => setFilterDirection(e.target.value as typeof filterDirection)}
                  className="px-2 py-1 text-xs bg-surface border border-border-muted rounded text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="all">All Messages</option>
                  <option value="sent">Sent Only</option>
                  <option value="received">Received Only</option>
                </select>
              </div>
            </div>

            {/* Messages list */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-auto">
                {filteredMessages.length > 0 ? (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-surface border-b border-border-muted">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">
                          Dir
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">
                          Type
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">
                          Size
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">
                          Time
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">
                          Data
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-muted">
                      {filteredMessages.map((msg) => (
                        <tr
                          key={msg.id}
                          onClick={() => setSelectedMessage(msg)}
                          className={`cursor-pointer transition-colors ${
                            selectedMessage?.id === msg.id
                              ? 'bg-accent-muted'
                              : 'hover:bg-surface-hover'
                          }`}
                        >
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 ${
                              msg.direction === 'sent' ? 'text-blue-400' : 'text-emerald-400'
                            }`}>
                              {msg.direction === 'sent' ? (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                </svg>
                              )}
                              <span className="text-xs">{msg.direction}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-text-secondary">{msg.type}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-mono text-text-muted">{formatBytes(msg.size)}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-mono text-text-muted">{formatTime(msg.timestamp)}</span>
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-xs font-mono text-text-secondary truncate max-w-md">
                              {msg.data}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-text-muted h-full">
                    <p className="text-sm">No messages</p>
                  </div>
                )}
              </div>

              {/* Message detail panel */}
              {selectedMessage && (
                <div className="w-80 border-l border-border-muted bg-surface flex flex-col">
                  <div className="p-3 border-b border-border-muted flex items-center justify-between">
                    <h4 className="text-sm font-medium text-text-primary">Message Detail</h4>
                    <button
                      onClick={() => setSelectedMessage(null)}
                      className="text-text-muted hover:text-text-secondary"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-3">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-text-muted">Direction</label>
                        <p className={`text-sm ${selectedMessage.direction === 'sent' ? 'text-blue-400' : 'text-emerald-400'}`}>
                          {selectedMessage.direction}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-text-muted">Type</label>
                        <p className="text-sm text-text-secondary">{selectedMessage.type}</p>
                      </div>
                      <div>
                        <label className="text-xs text-text-muted">Size</label>
                        <p className="text-sm font-mono text-text-secondary">{formatBytes(selectedMessage.size)}</p>
                      </div>
                      <div>
                        <label className="text-xs text-text-muted">Time</label>
                        <p className="text-sm font-mono text-text-secondary">
                          {new Date(selectedMessage.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-text-muted">Data</label>
                        <pre className="mt-1 p-2 bg-surface-hover rounded text-xs font-mono text-text-secondary overflow-auto max-h-64 whitespace-pre-wrap break-all">
                          {(() => {
                            try {
                              const parsed = JSON.parse(selectedMessage.data);
                              return JSON.stringify(parsed, null, 2);
                            } catch {
                              return selectedMessage.data;
                            }
                          })()}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </div>
              <p className="text-sm">Select a connection to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
