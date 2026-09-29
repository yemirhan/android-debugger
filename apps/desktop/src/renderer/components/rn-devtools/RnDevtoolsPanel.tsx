import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Device } from '@android-debugger/shared';
import {
  RN_DEVTOOLS_PARTITION,
  chooseTarget,
  rankTargets,
  targetKey,
  type MetroProbe,
  type RnDevtoolsTarget,
} from '../../../main/rn-devtools-protocol';
import { useMetroPort, useMetroProbe, useReverseStatus } from '../../hooks/useRnDevtools';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { ExternalIcon, MenuDotsIcon, PlugIcon, ReloadIcon, TerminalIcon } from './icons';
import { TargetPicker, targetDetail, targetLabel } from './TargetPicker';
import { MetroPortButton } from './MetroPortButton';

interface RnDevtoolsHostProps {
  /** The tab is on screen. */
  active: boolean;
  device: Device | null;
  packageName: string;
}

/**
 * Mounts the React Native DevTools tab the first time it's opened and keeps it
 * mounted (just hidden) afterwards, so switching tabs doesn't drop the
 * debugger session. Rendered by App outside the per-tab keyed container.
 */
export function RnDevtoolsHost({ active, device, packageName }: RnDevtoolsHostProps) {
  const [visited, setVisited] = useState(active);
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);

  if (!visited) return null;
  return (
    <div
      className={active ? 'absolute inset-0 flex flex-col bg-background panel-content' : 'hidden'}
      aria-hidden={!active}
    >
      <ErrorBoundary label="React Native DevTools">
        <RnDevtoolsPanel active={active} device={device} packageName={packageName} />
      </ErrorBoundary>
    </div>
  );
}

/** The DOM side of Electron's <webview>; only the methods this panel uses. */
type WebviewElement = HTMLWebViewElement & { reload(): void };

type Notice = { tone: 'ok' | 'error'; text: string } | null;

/** How many polls in a row a target may be missing before we call it disconnected. */
const MISSING_POLLS_BEFORE_DISCONNECT = 2;

function RnDevtoolsPanel({ active, device, packageName }: RnDevtoolsHostProps) {
  const port = useMetroPort();
  const { probe, refresh } = useMetroProbe(port, active);
  const { reversed, reverse } = useReverseStatus(device?.id ?? null, port, active);
  const deviceModel = device?.model ?? null;

  const targets = probe?.state === 'running' ? probe.targets : [];
  const context = useMemo(() => ({ packageName, deviceModel }), [packageName, deviceModel]);
  const ranked = useMemo(() => rankTargets(targets, context), [targets, context]);

  // The target whose DevTools is loaded in the webview. It survives the app
  // disconnecting so the session can pick up again when the app comes back.
  const [session, setSession] = useState<RnDevtoolsTarget | null>(null);
  const [connected, setConnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pinnedKey = useRef<string | null>(null);
  const missingPolls = useRef(0);
  const webviewRef = useRef<WebviewElement | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // Another Metro port is another dev server: drop the old session.
  const lastPort = useRef(port);
  useEffect(() => {
    if (lastPort.current === port) return;
    lastPort.current = port;
    pinnedKey.current = null;
    missingPolls.current = 0;
    setSession(null);
    setDismissed(false);
  }, [port]);

  // A different device or app in the toolbar means "show me that one".
  useEffect(() => {
    pinnedKey.current = null;
    setDismissed(false);
  }, [packageName, deviceModel]);

  useEffect(() => {
    if (!probe || dismissed) return;
    const wantedKey = pinnedKey.current ?? (session ? targetKey(session) : null);
    const same = session
      ? targets.find((target) => target.id === session.id) ?? targets.find((target) => targetKey(target) === wantedKey)
      : undefined;

    if (session && !same) {
      // Our app isn't listed (restarting, or Metro is down). Give it a couple
      // of polls before calling it disconnected, and keep the session so it
      // picks up again when the app returns.
      missingPolls.current++;
      if (missingPolls.current >= MISSING_POLLS_BEFORE_DISCONNECT) setConnected(false);
      return;
    }

    const next = same ?? chooseTarget(targets, context, { id: null, key: pinnedKey.current });
    if (!next) return;
    const wasDisconnected = missingPolls.current >= MISSING_POLLS_BEFORE_DISCONNECT;
    missingPolls.current = 0;
    setConnected(true);
    if (!session || next.id !== session.id || next.frontendUrl !== session.frontendUrl) {
      setSession(next);
    } else if (wasDisconnected) {
      // Same page, but its debugger socket died with the app: reconnect.
      webviewRef.current?.reload();
    }
    // Only re-run on new poll results; session/context changes are handled elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe]);

  // Picking another app or device in the header switches to its target, if it has one.
  useEffect(() => {
    if (pinnedKey.current || !packageName) return;
    const match = rankTargets(targets, context).find((target) => target.appId === packageName);
    if (match && match.id !== session?.id) {
      missingPolls.current = 0;
      setDismissed(false);
      setConnected(true);
      setSession(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  const pickTarget = useCallback((target: RnDevtoolsTarget) => {
    pinnedKey.current = targetKey(target);
    missingPolls.current = 0;
    setDismissed(false);
    setConnected(true);
    setSession(target);
  }, []);

  const closeSession = useCallback(() => {
    setSession(null);
    setDismissed(true);
    pinnedKey.current = null;
  }, []);

  // ⌘K pressed inside the DevTools webview: hand it to the app's palette.
  useEffect(() => {
    return window.electronAPI.rnDevtools.onShortcut((shortcut) => {
      if (shortcut !== 'command-palette' || !active) return;
      const isMac = navigator.platform.toLowerCase().includes('mac');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: isMac, ctrlKey: !isMac, bubbles: true }));
    });
  }, [active]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.tone === 'error' ? 6000 : 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const report = (result: { ok: boolean; error?: string }, success: string) =>
    setNotice(result.ok ? { tone: 'ok', text: success } : { tone: 'error', text: result.error ?? 'Something went wrong' });

  const reloadApp = async () => {
    report(await window.electronAPI.rnDevtools.sendCommand(port, 'reload'), 'Reload sent');
  };

  const openDevMenu = async () => {
    const result = await window.electronAPI.rnDevtools.sendCommand(port, 'devMenu');
    if (!result.ok && device) {
      // No app on Metro's message socket; the menu key still works over adb.
      report(await window.electronAPI.rnDevtools.openDevMenuViaAdb(device.id), 'Dev menu opened');
      return;
    }
    report(result, 'Dev menu opened');
  };

  const openExternally = async () => {
    if (!session) return;
    report(await window.electronAPI.rnDevtools.openExternal(port, session.id), 'Opened in your browser');
  };

  const reconnect = () => {
    missingPolls.current = 0;
    if (webviewRef.current) webviewRef.current.reload();
    void refresh();
  };

  const metroRunning = probe?.state === 'running';
  const showWebview = !!session?.frontendUrl && !dismissed;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="h-12 flex-shrink-0 flex items-center gap-2 px-3 border-b border-border-muted bg-surface">
        <TargetPicker
          targets={ranked}
          selected={session}
          connected={connected && !dismissed}
          device={device}
          packageName={packageName}
          onSelect={pickTarget}
          metroState={probe?.state ?? null}
        />

        <div className="flex-1 min-w-0 flex justify-end">
          {notice && (
            <span
              role="status"
              className={`text-xs truncate animate-pop-in ${notice.tone === 'error' ? 'text-log-error' : 'text-text-secondary'}`}
            >
              {notice.text}
            </span>
          )}
        </div>

        <ToolbarButton onClick={reloadApp} disabled={!metroRunning} label="Reload app" title="Reload the JavaScript bundle on connected apps">
          <ReloadIcon />
          <span className="hidden xl:inline">Reload app</span>
        </ToolbarButton>
        <ToolbarButton onClick={openDevMenu} disabled={!metroRunning && !device} label="Open dev menu" title="Open the React Native dev menu on the device">
          <MenuDotsIcon />
          <span className="hidden xl:inline">Dev menu</span>
        </ToolbarButton>
        <ToolbarButton onClick={reconnect} disabled={!showWebview} label="Reconnect DevTools" title="Reconnect DevTools to the app" iconOnly>
          <PlugIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={openExternally}
          disabled={!session?.frontendUrl || !metroRunning}
          label="Open in browser"
          title="Open this session in Chrome or Edge instead"
          iconOnly
        >
          <ExternalIcon />
        </ToolbarButton>
        <div className="w-px h-5 bg-border-muted mx-0.5" />
        <MetroPortButton port={port} probe={probe} device={device} reversed={reversed} onReverse={reverse} />
      </div>

      {/* Body */}
      {showWebview && session && !connected && probe && (
        <DisconnectedBanner target={session} metroStopped={!metroRunning} port={port} onClose={closeSession} />
      )}
      <div className="flex-1 min-h-0 relative">
        {showWebview && session?.frontendUrl && (
          <DevtoolsWebview ref={webviewRef} src={session.frontendUrl} onRetry={reconnect} />
        )}

        {!showWebview && (
          <div className="absolute inset-0 overflow-y-auto">
            <EmptyBody
              probe={probe}
              port={port}
              session={dismissed ? null : session}
              device={device}
              packageName={packageName}
              reversed={reversed}
              targets={ranked}
              onPick={pickTarget}
              onReverse={async () => report(await reverse(), `Port ${port} forwarded`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  title: string;
  iconOnly?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, disabled, label, title, iconOnly, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={`h-8 flex items-center gap-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none transition-colors flex-shrink-0 ${
        iconOnly ? 'w-8 justify-center' : 'min-w-8 justify-center px-2 xl:px-2.5'
      }`}
    >
      {children}
    </button>
  );
}

interface DevtoolsWebviewProps {
  src: string;
  onRetry: () => void;
}

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string } | { status: 'crashed' };

const DevtoolsWebview = React.forwardRef<WebviewElement, DevtoolsWebviewProps>(function DevtoolsWebview(
  { src, onRetry },
  forwardedRef
) {
  const localRef = useRef<WebviewElement | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const hasLoaded = useRef(false);

  const setRef = useCallback(
    (node: HTMLWebViewElement | null) => {
      const element = node as WebviewElement | null;
      localRef.current = element;
      if (typeof forwardedRef === 'function') forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    },
    [forwardedRef]
  );

  useEffect(() => {
    const webview = localRef.current;
    if (!webview) return;
    const onStart = () => {
      if (!hasLoaded.current) setLoad({ status: 'loading' });
    };
    const onReady = () => {
      hasLoaded.current = true;
      setLoad({ status: 'ready' });
    };
    const onFail = (event: Event) => {
      const { errorCode, errorDescription, isMainFrame } = event as Event & {
        errorCode: number;
        errorDescription: string;
        isMainFrame: boolean;
      };
      // -3 is ERR_ABORTED: a newer navigation replaced this one.
      if (!isMainFrame || errorCode === -3) return;
      setLoad({ status: 'failed', message: errorDescription || `Error ${errorCode}` });
    };
    const onGone = () => setLoad({ status: 'crashed' });
    webview.addEventListener('did-start-loading', onStart);
    webview.addEventListener('dom-ready', onReady);
    webview.addEventListener('did-fail-load', onFail);
    webview.addEventListener('render-process-gone', onGone);
    return () => {
      webview.removeEventListener('did-start-loading', onStart);
      webview.removeEventListener('dom-ready', onReady);
      webview.removeEventListener('did-fail-load', onFail);
      webview.removeEventListener('render-process-gone', onGone);
    };
  }, []);

  // New target: show the loading state again until its frontend is up.
  useEffect(() => {
    hasLoaded.current = false;
    setLoad({ status: 'loading' });
  }, [src]);

  return (
    <>
      <webview
        ref={setRef}
        src={src}
        partition={RN_DEVTOOLS_PARTITION}
        style={{ position: 'absolute', inset: 0, display: 'flex', background: 'var(--color-background)' }}
      />
      {load.status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background pointer-events-none">
          <p className="text-sm text-text-muted">Loading DevTools…</p>
        </div>
      )}
      {(load.status === 'failed' || load.status === 'crashed') && (
        <div className="absolute inset-0 flex items-center justify-center bg-background p-8">
          <div className="max-w-sm text-center">
            <p className="text-base font-medium text-text-primary">
              {load.status === 'crashed' ? 'DevTools stopped working' : 'DevTools couldn’t load'}
            </p>
            <p className="text-sm text-text-secondary mt-1.5">
              {load.status === 'crashed'
                ? 'The DevTools page crashed. Reload it to start a new session.'
                : `Metro didn’t serve the DevTools page (${load.message}). Check that Metro is still running, then try again.`}
            </p>
            <button
              onClick={() => {
                hasLoaded.current = false;
                setLoad({ status: 'loading' });
                onRetry();
              }}
              className="mt-5 px-3.5 h-8 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Reload DevTools
            </button>
          </div>
        </div>
      )}
    </>
  );
});

interface DisconnectedBannerProps {
  target: RnDevtoolsTarget;
  metroStopped: boolean;
  port: number;
  onClose: () => void;
}

function DisconnectedBanner({ target, metroStopped, port, onClose }: DisconnectedBannerProps) {
  return (
    <div
      role="status"
      className="h-9 flex-shrink-0 flex items-center gap-2.5 pl-3.5 pr-1.5 border-b border-border-muted bg-surface-elevated"
    >
      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
      <p className="flex-1 min-w-0 text-sm text-text-primary truncate">
        {metroStopped
          ? `Metro stopped on port ${port}. DevTools reconnects when it’s back.`
          : `${targetLabel(target)} disconnected. DevTools reconnects when the app is back.`}
      </p>
      <button
        onClick={onClose}
        className="h-7 px-2.5 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
      >
        Close session
      </button>
    </div>
  );
}

interface EmptyBodyProps {
  probe: MetroProbe | null;
  port: number;
  session: RnDevtoolsTarget | null;
  device: Device | null;
  packageName: string;
  reversed: boolean | null;
  targets: RnDevtoolsTarget[];
  onPick: (target: RnDevtoolsTarget) => void;
  onReverse: () => void;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[13px] px-1.5 py-0.5 rounded bg-surface-hover text-text-primary">{children}</code>
  );
}

function EmptyShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="w-11 h-11 mb-4 rounded-xl bg-surface border border-border-muted flex items-center justify-center text-text-muted">
          <TerminalIcon />
        </div>
        <p className="text-base font-medium text-text-primary">{title}</p>
        <div className="text-sm text-text-secondary mt-1.5 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function EmptyBody({
  probe,
  port,
  session,
  device,
  packageName,
  reversed,
  targets,
  onPick,
  onReverse,
}: EmptyBodyProps) {
  const [copied, setCopied] = useState(false);
  const [launching, setLaunching] = useState(false);

  if (!probe) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-sm text-text-muted">Looking for Metro on port {port}…</p>
      </div>
    );
  }

  if (probe.state === 'not-running') {
    return (
      <EmptyShell title="Start your React Native dev server">
        <p>DevTools connects through Metro. Start it in your project folder and this tab picks it up on its own:</p>
        <div className="flex flex-wrap gap-2">
          <Code>npx expo start</Code>
          <Code>npx react-native start</Code>
        </div>
        <p className="text-text-muted">
          Checking localhost:<span className="font-mono">{port}</span> every few seconds. Running Metro on another port? Change it with the Metro button in the toolbar.
        </p>
      </EmptyShell>
    );
  }

  if (probe.state === 'not-metro') {
    return (
      <EmptyShell title={`Port ${port} is used by another server`}>
        <p>
          Something other than Metro answered on localhost:<span className="font-mono">{port}</span>. Start Metro on a free port, for
          example <Code>npx expo start --port 8082</Code>, then set that port with the Metro button in the toolbar.
        </p>
      </EmptyShell>
    );
  }

  if (!probe.inspector) {
    return (
      <EmptyShell title="This Metro can’t host React Native DevTools">
        <p>
          Metro is running on port <span className="font-mono">{port}</span> but has no debugger endpoint. React Native DevTools needs
          React Native 0.73 or newer; 0.76 and later give the full experience.
        </p>
      </EmptyShell>
    );
  }

  if (session && !session.frontendUrl) {
    const copyUrl = async () => {
      const url = session.rawFrontendUrl ?? session.webSocketDebuggerUrl;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    };
    return (
      <EmptyShell title={`${targetLabel(session)} uses the legacy debugger`}>
        <p>
          React Native versions before 0.73 can only be debugged from Chrome. Open <Code>chrome://inspect</Code>, choose Configure and add{' '}
          <Code>localhost:{port}</Code>, or copy the DevTools link and paste it into Chrome’s address bar.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={copyUrl}
            className="px-3.5 h-8 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            {copied ? 'Copied' : 'Copy DevTools link'}
          </button>
        </div>
      </EmptyShell>
    );
  }

  if (targets.length > 0) {
    return (
      <EmptyShell title="Choose an app to inspect">
        <p>These apps are connected to Metro on port <span className="font-mono">{port}</span>.</p>
        <div className="rounded-lg border border-border-muted bg-surface p-1">
          {targets.map((target) => (
            <button
              key={target.id}
              onClick={() => onPick(target)}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left hover:bg-surface-hover transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-signal flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-text-primary truncate">{targetLabel(target)}</span>
                <span className="block text-xs text-text-muted truncate">{targetDetail(target)}</span>
              </span>
            </button>
          ))}
        </div>
      </EmptyShell>
    );
  }

  const deviceName = device ? device.model || device.id : null;
  const launch = async () => {
    if (!device || !packageName) return;
    setLaunching(true);
    try {
      await window.electronAPI.launchApp(device.id, packageName);
    } catch {
      // The poll shows whether it connected
    } finally {
      setLaunching(false);
    }
  };

  return (
    <EmptyShell title="Metro is running, but no app is connected">
      <ol className="space-y-3 list-none">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="flex-1 min-w-0">
            <p>
              Open your development build{packageName ? <> (<span className="font-mono text-text-primary">{packageName}</span>)</> : ''}
              {deviceName ? ` on ${deviceName}` : ' on your device'}. It appears here once its JavaScript has loaded.
            </p>
            {device && packageName && (
              <button
                onClick={launch}
                disabled={launching}
                className="mt-2 px-3 h-8 text-sm font-medium rounded-md border border-border bg-surface text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
              >
                {launching ? 'Opening…' : 'Open app'}
              </button>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="flex-1 min-w-0">
            <p>
              If the app shows “Unable to load script” or can’t find the dev server, let the device reach Metro on this computer.
            </p>
            {device ? (
              reversed ? (
                <p className="mt-2 flex items-center gap-2 text-text-primary">
                  <span className="w-2 h-2 rounded-full bg-signal" />
                  Port <span className="font-mono">{port}</span> is forwarded to {deviceName}
                </p>
              ) : (
                <button
                  onClick={onReverse}
                  className="mt-2 px-3 h-8 text-sm font-medium rounded-md border border-border bg-surface text-text-primary hover:bg-surface-hover transition-colors"
                >
                  Forward port {port} to {deviceName}
                </button>
              )
            ) : (
              <p className="mt-1 text-text-muted">
                Connect the device, then run <Code>adb reverse tcp:{port} tcp:{port}</Code>.
              </p>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={3} />
          <p className="flex-1 min-w-0">
            Still nothing? DevTools needs a debug build running on Hermes, the default engine since React Native 0.70. Release builds
            and Expo Go on old SDKs don’t expose a debugger.
          </p>
        </li>
      </ol>
    </EmptyShell>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="w-5 h-5 mt-px flex-shrink-0 rounded-full bg-surface-hover text-text-secondary text-xs font-medium flex items-center justify-center">
      {n}
    </span>
  );
}
