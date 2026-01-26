import React, { useState, useEffect } from 'react';
import type { NetworkRequest, SdkMessage } from '@android-debugger/shared';

export function NetworkPanel() {
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(null);
  const [filter, setFilter] = useState('');

  // Listen for SDK network messages
  useEffect(() => {
    const unsubscribe = window.electronAPI.onSdkMessage(({ message }: { message: SdkMessage }) => {
      if (message.type === 'network') {
        const request = message.payload as NetworkRequest;
        setRequests((prev) => {
          // Update existing request or add new one
          const existingIndex = prev.findIndex((r) => r.id === request.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = request;
            return updated;
          }
          return [...prev, request];
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const filteredRequests = requests.filter((r) =>
    r.url.toLowerCase().includes(filter.toLowerCase())
  );

  const getStatusColor = (status?: number) => {
    if (!status) return 'text-text-muted';
    if (status >= 200 && status < 300) return 'text-green-400';
    if (status >= 300 && status < 400) return 'text-amber-400';
    if (status >= 400) return 'text-red-400';
    return 'text-text-primary';
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET':
        return 'text-green-400';
      case 'POST':
        return 'text-blue-400';
      case 'PUT':
        return 'text-amber-400';
      case 'DELETE':
        return 'text-red-400';
      case 'PATCH':
        return 'text-violet-400';
      default:
        return 'text-text-primary';
    }
  };

  const clearRequests = () => {
    setRequests([]);
    setSelectedRequest(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Network</h2>
          <span className="text-sm text-text-muted">
            {requests.length} requests
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by URL..."
            className="w-64 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary placeholder-text-muted outline-none focus:border-violet-500"
          />
          <button
            onClick={clearRequests}
            className="px-3 py-1.5 text-sm bg-surface-hover rounded-lg hover:bg-border transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Request list */}
        <div className="flex-1 bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="grid grid-cols-[80px_1fr_80px_100px] gap-2 px-4 py-2 bg-surface-hover border-b border-border text-xs font-medium text-text-muted">
            <div>Method</div>
            <div>URL</div>
            <div>Status</div>
            <div>Duration</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <p>No network requests captured</p>
                <p className="text-xs mt-1">Connect the SDK to capture network traffic</p>
              </div>
            ) : (
              filteredRequests.map((request) => (
                <button
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  className={`w-full grid grid-cols-[80px_1fr_80px_100px] gap-2 px-4 py-2 text-left text-sm hover:bg-surface-hover transition-colors border-b border-border/50 ${
                    selectedRequest?.id === request.id ? 'bg-violet-500/10' : ''
                  }`}
                >
                  <div className={`font-mono font-medium ${getMethodColor(request.method)}`}>
                    {request.method}
                  </div>
                  <div className="text-text-primary truncate">{request.url}</div>
                  <div className={`font-mono ${getStatusColor(request.status)}`}>
                    {request.status || 'pending'}
                  </div>
                  <div className="text-text-muted">
                    {request.duration ? `${request.duration}ms` : '-'}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Request details */}
        {selectedRequest && (
          <div className="w-96 bg-surface rounded-xl border border-border overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-medium">Request Details</h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {/* URL */}
              <div>
                <p className="text-text-muted text-xs mb-1">URL</p>
                <p className="text-text-primary break-all font-mono text-xs">{selectedRequest.url}</p>
              </div>

              {/* Method & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-text-muted text-xs mb-1">Method</p>
                  <p className={`font-mono font-medium ${getMethodColor(selectedRequest.method)}`}>
                    {selectedRequest.method}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-xs mb-1">Status</p>
                  <p className={`font-mono font-medium ${getStatusColor(selectedRequest.status)}`}>
                    {selectedRequest.status || 'pending'}
                  </p>
                </div>
              </div>

              {/* Duration */}
              {selectedRequest.duration && (
                <div>
                  <p className="text-text-muted text-xs mb-1">Duration</p>
                  <p className="text-text-primary">{selectedRequest.duration}ms</p>
                </div>
              )}

              {/* Request Headers */}
              {Object.keys(selectedRequest.headers || {}).length > 0 && (
                <div>
                  <p className="text-text-muted text-xs mb-2">Request Headers</p>
                  <div className="bg-surface-hover rounded-lg p-2 font-mono text-xs space-y-1">
                    {Object.entries(selectedRequest.headers).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-cyan-400">{key}:</span>
                        <span className="text-text-primary break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request Body */}
              {selectedRequest.body && (
                <div>
                  <p className="text-text-muted text-xs mb-2">Request Body</p>
                  <pre className="bg-surface-hover rounded-lg p-2 font-mono text-xs text-text-primary overflow-x-auto whitespace-pre-wrap">
                    {selectedRequest.body}
                  </pre>
                </div>
              )}

              {/* Response Headers */}
              {selectedRequest.responseHeaders && Object.keys(selectedRequest.responseHeaders).length > 0 && (
                <div>
                  <p className="text-text-muted text-xs mb-2">Response Headers</p>
                  <div className="bg-surface-hover rounded-lg p-2 font-mono text-xs space-y-1">
                    {Object.entries(selectedRequest.responseHeaders).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-cyan-400">{key}:</span>
                        <span className="text-text-primary break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Response Body */}
              {selectedRequest.responseBody && (
                <div>
                  <p className="text-text-muted text-xs mb-2">Response Body</p>
                  <pre className="bg-surface-hover rounded-lg p-2 font-mono text-xs text-text-primary overflow-x-auto whitespace-pre-wrap max-h-64">
                    {selectedRequest.responseBody}
                  </pre>
                </div>
              )}

              {/* Error */}
              {selectedRequest.error && (
                <div>
                  <p className="text-text-muted text-xs mb-2">Error</p>
                  <pre className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 font-mono text-xs text-red-400">
                    {selectedRequest.error}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
