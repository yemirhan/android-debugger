import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { McpPublicState } from '../../../main/mcp-types';
import { buildMcpGuides, type McpClientGuide, type McpSnippet } from '../../lib/mcp-setup';
import { useSettingsSectionTarget } from '../../lib/settings-section';
import { describeError, toast } from '../../lib/toast';
import { NumberInput, SettingRow, Toggle } from './controls';

const TOKEN_PLACEHOLDER = '<token>';
const PORT_MIN = 1024;
const PORT_MAX = 65535;

function useMcpState() {
  const [state, setState] = useState<McpPublicState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.mcp
      .getState()
      .then((next) => !cancelled && setState(next))
      .catch((error) => !cancelled && setLoadError(describeError(error)));
    const unsubscribe = window.electronAPI.mcp.onState(setState);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return { state, setState, loadError };
}

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

export function McpSettingsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  useSettingsSectionTarget('mcp', sectionRef);
  const { state, setState, loadError } = useMcpState();
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guideId, setGuideId] = useState<McpClientGuide['id']>('claude-code');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!confirmRegenerate) return;
    const timer = setTimeout(() => setConfirmRegenerate(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmRegenerate]);

  const loadToken = useCallback(async () => {
    const value = await window.electronAPI.mcp.getToken();
    setToken(value);
    return value;
  }, []);

  const update = useCallback(
    async (patch: Parameters<typeof window.electronAPI.mcp.update>[0]) => {
      setBusy(true);
      try {
        setState(await window.electronAPI.mcp.update(patch));
      } catch (error) {
        toast.error('Could not update the MCP server', { description: describeError(error) });
      } finally {
        setBusy(false);
      }
    },
    [setState]
  );

  const retry = useCallback(async () => {
    setBusy(true);
    try {
      setState(await window.electronAPI.mcp.retry());
    } catch (error) {
      toast.error('Could not start the MCP server', { description: describeError(error) });
    } finally {
      setBusy(false);
    }
  }, [setState]);

  const copy = useCallback(async (text: string, what: string) => {
    try {
      await window.electronAPI.writeClipboardText(text);
      toast.success(`${what} copied`);
    } catch (error) {
      toast.error(`Could not copy ${what.toLowerCase()}`, { description: describeError(error) });
    }
  }, []);

  const copyToken = useCallback(async () => {
    try {
      await copy(token ?? (await loadToken()), 'Token');
    } catch (error) {
      toast.error('Could not read the token', { description: describeError(error) });
    }
  }, [copy, loadToken, token]);

  const toggleReveal = useCallback(async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    try {
      if (!token) await loadToken();
      setRevealed(true);
    } catch (error) {
      toast.error('Could not read the token', { description: describeError(error) });
    }
  }, [loadToken, revealed, token]);

  const regenerate = useCallback(async () => {
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      return;
    }
    setConfirmRegenerate(false);
    try {
      setState(await window.electronAPI.mcp.regenerateToken());
      await loadToken();
      toast.success('New token created', {
        description: 'Update any HTTP setups that use the old token. The local bridge picks it up automatically.',
      });
    } catch (error) {
      toast.error('Could not create a new token', { description: describeError(error) });
    }
  }, [confirmRegenerate, loadToken, setState]);

  const guides = useMemo(
    () => (state ? buildMcpGuides({ url: state.url, setup: state.setup, token: revealed && token ? token : TOKEN_PLACEHOLDER }) : []),
    [revealed, state, token]
  );
  const activeGuide = guides.find((guide) => guide.id === guideId) ?? guides[0];

  const copySnippet = useCallback(
    async (snippet: McpSnippet) => {
      if (!state || !snippet.containsToken) {
        await copy(snippet.code, 'Command');
        return;
      }
      try {
        const realToken = token ?? (await loadToken());
        const full = buildMcpGuides({ url: state.url, setup: state.setup, token: realToken })
          .flatMap((guide) => guide.snippets)
          .find((candidate) => candidate.id === snippet.id);
        await copy(full?.code ?? snippet.code, 'Command');
      } catch (error) {
        toast.error('Could not read the token', { description: describeError(error) });
      }
    },
    [copy, loadToken, state, token]
  );

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="settings-mcp-title"
      className="bg-surface rounded-lg p-4 border border-border-muted outline-none scroll-mt-4"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 id="settings-mcp-title" className="text-xs font-medium text-text-muted">
            AI assistants (MCP)
          </h3>
          <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">
            Let Claude Code, Codex and other MCP clients read logs, crashes, network and performance data, take
            screenshots and drive the device through Android Debugger. The server only accepts connections from this
            computer.
          </p>
        </div>
        {state && <StatusBadge state={state} />}
      </div>

      {!state ? (
        <p className={`text-sm ${loadError ? 'text-log-error' : 'text-text-muted'}`}>
          {loadError ? `Could not load the MCP settings: ${loadError}` : 'Loading…'}
        </p>
      ) : (
        <div className="space-y-4">
          <SettingRow label="Local MCP server" description="Listens on 127.0.0.1 only and requires the access token below">
            <Toggle value={state.enabled} disabled={busy} label="Local MCP server" onChange={(enabled) => update({ enabled })} />
          </SettingRow>

          {state.error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 text-xs text-log-error bg-log-error/10 border border-log-error/30 rounded-md px-3 py-2"
            >
              <span>{state.error}</span>
              <TextButton onClick={retry}>Try again</TextButton>
            </div>
          )}

          <SettingRow
            label="Address"
            description={
              state.enabled && state.state === 'running'
                ? state.lastRequestAt
                  ? `Last request ${relativeTime(state.lastRequestAt, now)}`
                  : 'No assistant has connected yet'
                : state.enabled
                  ? 'Not reachable until the server starts'
                  : 'Turn the server on to connect an assistant'
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <code className="text-xs font-mono text-text-primary bg-background border border-border-muted rounded-md px-2 py-1.5 truncate">
                {state.url}
              </code>
              <IconButton label="Copy address" onClick={() => copy(state.url, 'Address')}>
                <CopyGlyph />
              </IconButton>
            </div>
          </SettingRow>

          <SettingRow label="Port" description="Change it if another program already uses this port">
            <NumberInput
              value={state.port}
              label="MCP server port"
              disabled={busy}
              min={PORT_MIN}
              max={PORT_MAX}
              step={1}
              onChange={(port) => update({ port })}
            />
          </SettingRow>

          <SettingRow
            label="Allow risky tools"
            description="Lets assistants run shell commands, install and uninstall apps, and clear app data"
          >
            <Toggle
              value={state.allowRiskyTools}
              disabled={busy}
              label="Allow risky tools"
              onChange={(allowRiskyTools) => update({ allowRiskyTools })}
            />
          </SettingRow>
          {state.allowRiskyTools && (
            <p className="text-xs text-log-warn -mt-2">
              Assistants can now change or delete data on your devices. Turn this off when you no longer need it.
            </p>
          )}

          <div>
            <p className="text-sm text-text-primary">Access token</p>
            <p className="text-xs text-text-muted">
              HTTP setups send it as a bearer token. The local bridge reads it for you
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code
                aria-label={revealed ? 'Access token' : 'Access token (hidden)'}
                className="flex-1 min-w-48 text-xs font-mono text-text-primary bg-background border border-border-muted rounded-md px-2 py-1.5 truncate"
              >
                {revealed && token ? token : '•'.repeat(32)}
              </code>
              <TextButton onClick={toggleReveal}>{revealed ? 'Hide' : 'Show'}</TextButton>
              <TextButton onClick={copyToken}>Copy</TextButton>
              <TextButton onClick={regenerate} tone={confirmRegenerate ? 'danger' : 'default'}>
                {confirmRegenerate ? 'Confirm new token' : 'Regenerate'}
              </TextButton>
            </div>
          </div>

          <div className="pt-4 border-t border-border-muted">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
              <div className="min-w-0">
                <p className="text-sm text-text-primary">Connect an assistant</p>
                <p className="text-xs text-text-muted">Run one of these once, then ask your assistant to use Android Debugger</p>
              </div>
              <div role="tablist" aria-label="Assistant" className="flex p-0.5 rounded-md bg-background border border-border-muted">
                {guides.map((guide) => (
                  <button
                    key={guide.id}
                    type="button"
                    role="tab"
                    aria-selected={guide.id === activeGuide?.id}
                    onClick={() => setGuideId(guide.id)}
                    className={`px-2.5 h-7 text-xs whitespace-nowrap rounded transition-colors ${
                      guide.id === activeGuide?.id
                        ? 'bg-surface-hover text-text-primary'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {guide.label}
                  </button>
                ))}
              </div>
            </div>

            {!state.setup.bridgeExists && (
              <p className="text-xs text-log-warn mb-3">
                The bridge script was not found at {state.setup.bridgePath}. Use the HTTP setup, or rebuild the app.
              </p>
            )}

            <div className="space-y-3" role="tabpanel">
              {activeGuide?.snippets.map((snippet) => (
                <SnippetBlock key={snippet.id} snippet={snippet} onCopy={() => copySnippet(snippet)} />
              ))}
            </div>
            <p className="text-xs text-text-muted mt-3">
              Keep Android Debugger running while you use the assistant. Tools use the device and app selected here
              unless the assistant picks others.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ state }: { state: McpPublicState }) {
  const { label, dot, text } =
    state.state === 'running'
      ? { label: 'Running', dot: 'bg-signal', text: 'text-text-primary' }
      : state.state === 'starting'
        ? { label: 'Starting…', dot: 'bg-accent', text: 'text-text-secondary' }
        : state.state === 'error'
          ? { label: 'Not running', dot: 'bg-log-error', text: 'text-log-error' }
          : { label: 'Off', dot: 'bg-text-muted', text: 'text-text-muted' };
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1.5 h-6 px-2 rounded-full border border-border-muted bg-background text-xs ${text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

function SnippetBlock({ snippet, onCopy }: { snippet: McpSnippet; onCopy: () => void }) {
  return (
    <div className="rounded-md border border-border-muted bg-background">
      <div className="flex items-start justify-between gap-3 px-3 pt-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary">{snippet.title}</p>
          <p className="text-xs text-text-muted mt-0.5">{snippet.description}</p>
        </div>
        <TextButton onClick={onCopy}>Copy</TextButton>
      </div>
      <pre className="px-3 py-2.5 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all select-text">
        {snippet.code}
      </pre>
    </div>
  );
}

function TextButton({
  children,
  onClick,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-2.5 h-7 text-xs rounded-md border transition-colors ${
        tone === 'danger'
          ? 'border-log-error/40 text-log-error hover:bg-log-error/10'
          : 'border-border bg-surface text-text-primary hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      {children}
    </button>
  );
}

function CopyGlyph() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </svg>
  );
}
