import React, { useState, useMemo } from 'react';
import type { NetworkRequest } from '@android-debugger/shared';
import { useSdkContext } from '../contexts/SdkContext';

type MethodFilter = 'all' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'pending' | 'error';

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

function escapeShellArg(str: string): string {
  // Escape single quotes for shell
  return str.replace(/'/g, "'\\''");
}

function generateCurl(request: NetworkRequest): string {
  const lines: string[] = [];

  // Start with curl command
  lines.push('curl');

  // Location flag - follow redirects
  lines.push('  --location');

  // Request method
  lines.push(`  --request ${request.method.toUpperCase()}`);

  // URL
  lines.push(`  '${escapeShellArg(request.url)}'`);

  // All headers
  if (request.headers && Object.keys(request.headers).length > 0) {
    for (const [key, value] of Object.entries(request.headers)) {
      lines.push(`  --header '${escapeShellArg(key)}: ${escapeShellArg(value)}'`);
    }
  }

  // Body/data
  if (request.body) {
    // Check if it's JSON and format nicely
    let bodyContent = request.body;
    try {
      // If it's valid JSON, we can keep it as-is
      JSON.parse(bodyContent);
      lines.push(`  --data '${escapeShellArg(bodyContent)}'`);
    } catch {
      // Not JSON, use --data-raw for raw content
      lines.push(`  --data-raw '${escapeShellArg(bodyContent)}'`);
    }
  }

  return lines.join(' \\\n');
}

function generateCurlCompact(request: NetworkRequest): string {
  const parts: string[] = ['curl', '-L', '-X', request.method.toUpperCase()];

  // URL
  parts.push(`'${escapeShellArg(request.url)}'`);

  // Headers
  if (request.headers && Object.keys(request.headers).length > 0) {
    for (const [key, value] of Object.entries(request.headers)) {
      parts.push('-H', `'${escapeShellArg(key)}: ${escapeShellArg(value)}'`);
    }
  }

  // Body
  if (request.body) {
    parts.push('-d', `'${escapeShellArg(request.body)}'`);
  }

  return parts.join(' ');
}

type CopyType = 'curl' | 'curl-compact' | 'url' | 'response' | 'headers' | null;

export function NetworkPanel() {
  const { requests, selectedRequest, setSelectedRequest, clearRequests } = useSdkContext();
  const [urlFilter, setUrlFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [copied, setCopied] = useState<CopyType>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // URL filter
      if (urlFilter && !r.url.toLowerCase().includes(urlFilter.toLowerCase())) {
        return false;
      }

      // Method filter
      if (methodFilter !== 'all' && r.method.toUpperCase() !== methodFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          if (r.status !== undefined) return false;
        } else if (statusFilter === 'error') {
          if (!r.error && !(r.status && r.status >= 400)) return false;
        } else if (statusFilter === '2xx') {
          if (!r.status || r.status < 200 || r.status >= 300) return false;
        } else if (statusFilter === '3xx') {
          if (!r.status || r.status < 300 || r.status >= 400) return false;
        } else if (statusFilter === '4xx') {
          if (!r.status || r.status < 400 || r.status >= 500) return false;
        } else if (statusFilter === '5xx') {
          if (!r.status || r.status < 500 || r.status >= 600) return false;
        }
      }

      return true;
    });
  }, [requests, urlFilter, methodFilter, statusFilter]);

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

  const copyToClipboard = async (type: CopyType) => {
    if (!selectedRequest || !type) return;

    let content = '';
    switch (type) {
      case 'curl':
        content = generateCurl(selectedRequest);
        break;
      case 'curl-compact':
        content = generateCurlCompact(selectedRequest);
        break;
      case 'url':
        content = selectedRequest.url;
        break;
      case 'response':
        content = selectedRequest.responseBody || '';
        break;
      case 'headers':
        content = Object.entries(selectedRequest.headers || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
        break;
    }

    await navigator.clipboard.writeText(content);
    setCopied(type);
    setShowCopyMenu(false);
    setTimeout(() => setCopied(null), 2000);
  };

  const activeFiltersCount = [
    methodFilter !== 'all',
    statusFilter !== 'all',
    urlFilter !== '',
  ].filter(Boolean).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Network</h2>
          <span className="text-sm text-text-muted">
            {filteredRequests.length === requests.length
              ? `${requests.length} requests`
              : `${filteredRequests.length} of ${requests.length} requests`
            }
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* URL Filter */}
          <input
            type="text"
            value={urlFilter}
            onChange={(e) => setUrlFilter(e.target.value)}
            placeholder="Filter by URL..."
            className="w-48 px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary placeholder-text-muted outline-none focus:border-violet-500"
          />

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
            className="px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary outline-none focus:border-violet-500 cursor-pointer"
          >
            <option value="all">All Methods</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1.5 bg-surface-hover rounded-lg border border-border text-sm text-text-primary outline-none focus:border-violet-500 cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx Client Error</option>
            <option value="5xx">5xx Server Error</option>
            <option value="pending">Pending</option>
            <option value="error">Has Error</option>
          </select>

          {/* Clear filters */}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => {
                setUrlFilter('');
                setMethodFilter('all');
                setStatusFilter('all');
              }}
              className="px-3 py-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
            >
              Clear filters
            </button>
          )}

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
                {requests.length === 0 ? (
                  <>
                    <p>No network requests captured</p>
                    <p className="text-xs mt-1">Connect the SDK to capture network traffic</p>
                  </>
                ) : (
                  <>
                    <p>No requests match filters</p>
                    <button
                      onClick={() => {
                        setUrlFilter('');
                        setMethodFilter('all');
                        setStatusFilter('all');
                      }}
                      className="text-xs mt-1 text-violet-400 hover:text-violet-300"
                    >
                      Clear filters
                    </button>
                  </>
                )}
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
              <div className="flex items-center gap-2">
                {/* Copy dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowCopyMenu(!showCopyMenu)}
                    className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                      copied
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showCopyMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowCopyMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                        <button
                          onClick={() => copyToClipboard('curl')}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-hover flex items-center gap-2"
                        >
                          <span className="text-text-primary">Copy as cURL</span>
                          <span className="text-text-muted">(formatted)</span>
                        </button>
                        <button
                          onClick={() => copyToClipboard('curl-compact')}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-hover flex items-center gap-2"
                        >
                          <span className="text-text-primary">Copy as cURL</span>
                          <span className="text-text-muted">(compact)</span>
                        </button>
                        <div className="h-px bg-border my-1" />
                        <button
                          onClick={() => copyToClipboard('url')}
                          className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover"
                        >
                          Copy URL
                        </button>
                        <button
                          onClick={() => copyToClipboard('headers')}
                          className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover"
                        >
                          Copy Request Headers
                        </button>
                        {selectedRequest.responseBody && (
                          <button
                            onClick={() => copyToClipboard('response')}
                            className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover"
                          >
                            Copy Response Body
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
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
