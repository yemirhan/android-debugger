import React, { useState, useMemo } from 'react';
import type { NetworkRequest } from '@android-debugger/shared';
import { useSdkContext } from '../contexts/SdkContext';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

type MethodFilter = 'all' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'pending' | 'error';

const CopyIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

function escapeShellArg(str: string): string {
  return str.replace(/'/g, "'\\''");
}

function generateCurl(request: NetworkRequest): string {
  const lines: string[] = [];
  lines.push('curl');
  lines.push('  --location');
  lines.push(`  --request ${request.method.toUpperCase()}`);
  lines.push(`  '${escapeShellArg(request.url)}'`);

  if (request.headers && Object.keys(request.headers).length > 0) {
    for (const [key, value] of Object.entries(request.headers)) {
      lines.push(`  --header '${escapeShellArg(key)}: ${escapeShellArg(value)}'`);
    }
  }

  if (request.body) {
    try {
      JSON.parse(request.body);
      lines.push(`  --data '${escapeShellArg(request.body)}'`);
    } catch {
      lines.push(`  --data-raw '${escapeShellArg(request.body)}'`);
    }
  }

  return lines.join(' \\\n');
}

function generateCurlCompact(request: NetworkRequest): string {
  const parts: string[] = ['curl', '-L', '-X', request.method.toUpperCase()];
  parts.push(`'${escapeShellArg(request.url)}'`);

  if (request.headers && Object.keys(request.headers).length > 0) {
    for (const [key, value] of Object.entries(request.headers)) {
      parts.push('-H', `'${escapeShellArg(key)}: ${escapeShellArg(value)}'`);
    }
  }

  if (request.body) {
    parts.push('-d', `'${escapeShellArg(request.body)}'`);
  }

  return parts.join(' ');
}

type CopyType = 'curl' | 'curl-compact' | 'url' | 'response' | 'headers' | null;

export function NetworkPanel() {
  const [showInfo, setShowInfo] = useState(false);
  const { requests, selectedRequest, setSelectedRequest, clearRequests } = useSdkContext();
  const [urlFilter, setUrlFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [copied, setCopied] = useState<CopyType>(null);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const guide = tabGuides['network'];

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (urlFilter && !r.url.toLowerCase().includes(urlFilter.toLowerCase())) {
        return false;
      }
      if (methodFilter !== 'all' && r.method.toUpperCase() !== methodFilter) {
        return false;
      }
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
    if (status >= 200 && status < 300) return 'text-emerald-400';
    if (status >= 300 && status < 400) return 'text-amber-400';
    if (status >= 400) return 'text-red-400';
    return 'text-text-primary';
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET': return 'text-emerald-400';
      case 'POST': return 'text-blue-400';
      case 'PUT': return 'text-amber-400';
      case 'DELETE': return 'text-red-400';
      case 'PATCH': return 'text-violet-400';
      default: return 'text-text-primary';
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
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Network</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
          <span className="text-xs text-text-muted font-mono">
            {filteredRequests.length === requests.length
              ? `${requests.length} requests`
              : `${filteredRequests.length} / ${requests.length}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* URL Filter */}
          <div className="relative">
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={urlFilter}
              onChange={(e) => setUrlFilter(e.target.value)}
              placeholder="Filter URL..."
              className="w-40 pl-8 pr-3 py-1.5 bg-surface rounded-md border border-border-muted text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
            className="px-2.5 py-1.5 bg-surface rounded-md border border-border-muted text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
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
            className="px-2.5 py-1.5 bg-surface rounded-md border border-border-muted text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="2xx">2xx Success</option>
            <option value="3xx">3xx Redirect</option>
            <option value="4xx">4xx Error</option>
            <option value="5xx">5xx Error</option>
            <option value="pending">Pending</option>
            <option value="error">Has Error</option>
          </select>

          {activeFiltersCount > 0 && (
            <button
              onClick={() => {
                setUrlFilter('');
                setMethodFilter('all');
                setStatusFilter('all');
              }}
              className="px-2.5 py-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              Clear filters
            </button>
          )}

          <button
            onClick={clearRequests}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Request list */}
        <div className="flex-1 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col">
          <div className="grid grid-cols-[70px_1fr_70px_80px] gap-2 px-3 py-2 bg-surface-hover border-b border-border-muted text-xs font-medium text-text-muted">
            <div>Method</div>
            <div>URL</div>
            <div>Status</div>
            <div>Duration</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <div className="w-12 h-12 mb-3 rounded-xl bg-surface-hover flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                </div>
                {requests.length === 0 ? (
                  <>
                    <p className="text-sm">No network requests</p>
                    <p className="text-xs mt-1">Connect the SDK to capture traffic</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">No requests match filters</p>
                    <button
                      onClick={() => {
                        setUrlFilter('');
                        setMethodFilter('all');
                        setStatusFilter('all');
                      }}
                      className="text-xs mt-1 text-accent hover:text-accent/80"
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
                  className={`w-full grid grid-cols-[70px_1fr_70px_80px] gap-2 px-3 py-2 text-left text-xs hover:bg-surface-hover/50 transition-colors border-b border-border-muted/50 ${
                    selectedRequest?.id === request.id ? 'bg-accent/10' : ''
                  }`}
                >
                  <div className={`font-mono font-medium ${getMethodColor(request.method)}`}>
                    {request.method}
                  </div>
                  <div className="text-text-primary truncate font-mono">{request.url}</div>
                  <div className={`font-mono ${getStatusColor(request.status)}`}>
                    {request.status || '...'}
                  </div>
                  <div className="text-text-muted font-mono">
                    {request.duration ? `${request.duration}ms` : '-'}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Request details */}
        {selectedRequest && (
          <div className="w-96 bg-surface rounded-lg border border-border-muted overflow-hidden flex flex-col animate-slide-in">
            <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between bg-surface-hover">
              <h3 className="text-sm font-medium">Request Details</h3>
              <div className="flex items-center gap-2">
                {/* Copy dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowCopyMenu(!showCopyMenu)}
                    className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-all duration-150 ${
                      copied
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-surface text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  {showCopyMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowCopyMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-surface-elevated border border-border rounded-lg shadow-xl py-1 min-w-[150px] backdrop-blur-dropdown animate-fade-in">
                        <button
                          onClick={() => copyToClipboard('curl')}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-hover transition-colors"
                        >
                          <span className="text-text-primary">Copy as cURL</span>
                        </button>
                        <button
                          onClick={() => copyToClipboard('curl-compact')}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-hover transition-colors"
                        >
                          <span className="text-text-primary">Copy cURL (compact)</span>
                        </button>
                        <div className="h-px bg-border-muted my-1" />
                        <button
                          onClick={() => copyToClipboard('url')}
                          className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover transition-colors"
                        >
                          Copy URL
                        </button>
                        <button
                          onClick={() => copyToClipboard('headers')}
                          className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover transition-colors"
                        >
                          Copy Headers
                        </button>
                        {selectedRequest.responseBody && (
                          <button
                            onClick={() => copyToClipboard('response')}
                            className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover transition-colors"
                          >
                            Copy Response
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-1 text-text-muted hover:text-text-primary transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {/* URL */}
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1.5">URL</p>
                <p className="text-text-primary break-all font-mono text-xs bg-surface-hover rounded p-2">{selectedRequest.url}</p>
              </div>

              {/* Method & Status */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Method</p>
                  <p className={`font-mono font-medium text-sm ${getMethodColor(selectedRequest.method)}`}>
                    {selectedRequest.method}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Status</p>
                  <p className={`font-mono font-medium text-sm ${getStatusColor(selectedRequest.status)}`}>
                    {selectedRequest.status || 'pending'}
                  </p>
                </div>
                {selectedRequest.duration && (
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Duration</p>
                    <p className="font-mono text-sm">{selectedRequest.duration}ms</p>
                  </div>
                )}
              </div>

              {/* Request Headers */}
              {Object.keys(selectedRequest.headers || {}).length > 0 && (
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Request Headers</p>
                  <div className="bg-surface-hover rounded-md p-2 font-mono text-xs space-y-1">
                    {Object.entries(selectedRequest.headers).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-cyan-400 shrink-0">{key}:</span>
                        <span className="text-text-primary break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request Body */}
              {selectedRequest.body && (
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Request Body</p>
                  <pre className="bg-surface-hover rounded-md p-2 font-mono text-xs text-text-primary overflow-x-auto whitespace-pre-wrap">
                    {selectedRequest.body}
                  </pre>
                </div>
              )}

              {/* Response Headers */}
              {selectedRequest.responseHeaders && Object.keys(selectedRequest.responseHeaders).length > 0 && (
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Response Headers</p>
                  <div className="bg-surface-hover rounded-md p-2 font-mono text-xs space-y-1">
                    {Object.entries(selectedRequest.responseHeaders).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-cyan-400 shrink-0">{key}:</span>
                        <span className="text-text-primary break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Response Body */}
              {selectedRequest.responseBody && (
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Response Body</p>
                  <pre className="bg-surface-hover rounded-md p-2 font-mono text-xs text-text-primary overflow-x-auto whitespace-pre-wrap max-h-64">
                    {selectedRequest.responseBody}
                  </pre>
                </div>
              )}

              {/* Error */}
              {selectedRequest.error && (
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Error</p>
                  <pre className="bg-red-500/10 border border-red-500/20 rounded-md p-2 font-mono text-xs text-red-400">
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
