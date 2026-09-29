/**
 * The local MCP server: Streamable HTTP on 127.0.0.1 only, path /mcp, with
 * Host/Origin checks and a per-install bearer token (see mcp-security.ts).
 *
 * Stateless: every POST gets a fresh McpServer + transport, so there are no
 * sessions to leak and a restart never strands a client. Responses are plain
 * JSON (no SSE), which also keeps the stdio bridge trivial.
 */
import * as http from 'node:http';
import { ipcMain } from 'electron';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  isValidMcpPort,
  loadMcpSettings,
  mcpUrl,
  MCP_PATH,
  saveMcpSettings,
  type McpSettings,
} from './mcp-config';
import { checkMcpRequest, generateMcpToken } from './mcp-security';
import { createMcpServer, type McpToolHost } from './mcp-tools';
import type { McpPublicState, McpServerState, McpSetupInfo } from './mcp-types';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type { McpPublicState, McpServerState, McpSetupInfo } from './mcp-types';

export class McpController {
  private settings: McpSettings;
  private server: http.Server | null = null;
  private state: McpServerState = 'stopped';
  private error: string | undefined;
  private lastRequestAt: number | undefined;
  private listeners = new Set<(state: McpPublicState) => void>();
  private readonly configPath: string;
  private readonly host: McpToolHost;
  private readonly setup: () => McpSetupInfo;

  constructor(options: { configPath: string; host: McpToolHost; setup: () => McpSetupInfo }) {
    this.configPath = options.configPath;
    this.host = options.host;
    this.setup = options.setup;
    this.settings = loadMcpSettings(this.configPath, generateMcpToken);
  }

  isRiskyAllowed(): boolean {
    return this.settings.allowRiskyTools;
  }

  getToken(): string {
    return this.settings.token;
  }

  onChange(listener: (state: McpPublicState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): McpPublicState {
    return {
      enabled: this.settings.enabled,
      port: this.settings.port,
      allowRiskyTools: this.settings.allowRiskyTools,
      state: this.state,
      url: mcpUrl(this.settings.port),
      error: this.error,
      lastRequestAt: this.lastRequestAt,
      setup: this.setup(),
    };
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  /** Starts the server when enabled (no-op when it is already running on the right port). */
  async start(): Promise<void> {
    if (!this.settings.enabled) {
      await this.stop();
      return;
    }
    if (this.server) return;
    const port = this.settings.port;
    this.state = 'starting';
    this.error = undefined;
    this.emit();

    const server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    // Slow-loris guard; tool calls themselves may take a while (installs), so only headers are bounded.
    server.headersTimeout = 10_000;
    server.requestTimeout = 0;
    this.server = server;

    await new Promise<void>((resolve) => {
      const onError = (error: NodeJS.ErrnoException) => {
        if (this.server === server) this.server = null;
        this.state = 'error';
        this.error =
          error.code === 'EADDRINUSE'
            ? `Port ${port} is already in use by another program. Pick a different port.`
            : `Could not start the MCP server: ${error.message}`;
        resolve();
      };
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError);
        server.on('error', (error) => console.error('[mcp] Server error:', error));
        this.state = 'running';
        resolve();
      });
    });
    this.emit();
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
    const changed = this.state !== 'stopped' || this.error !== undefined;
    this.state = 'stopped';
    this.error = undefined;
    if (changed) this.emit();
  }

  async update(patch: { enabled?: unknown; port?: unknown; allowRiskyTools?: unknown }): Promise<McpPublicState> {
    const next = { ...this.settings };
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
    if (typeof patch.allowRiskyTools === 'boolean') next.allowRiskyTools = patch.allowRiskyTools;
    if (patch.port !== undefined) {
      if (!isValidMcpPort(patch.port)) throw new Error('Choose a port between 1024 and 65535.');
      next.port = patch.port;
    }
    const restart = next.port !== this.settings.port || next.enabled !== this.settings.enabled;
    this.settings = next;
    saveMcpSettings(this.configPath, next);
    if (restart) {
      await this.stop();
      await this.start();
    } else {
      this.emit();
    }
    return this.getState();
  }

  /** Tries to start again, e.g. after the port was freed. */
  async retry(): Promise<McpPublicState> {
    await this.stop();
    await this.start();
    return this.getState();
  }

  /** New token; clients configured with the old one must be updated (the stdio bridge picks it up itself). */
  regenerateToken(): McpPublicState {
    this.settings = { ...this.settings, token: generateMcpToken() };
    saveMcpSettings(this.configPath, this.settings);
    this.emit();
    return this.getState();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reply = (status: number, message: string, extraHeaders: Record<string, string> = {}) => {
      if (res.headersSent) return;
      res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
    };

    try {
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      const check = checkMcpRequest(
        {
          host: req.headers.host,
          origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
          authorization: req.headers.authorization,
        },
        { port: this.settings.port, token: this.settings.token }
      );
      if (!check.ok) {
        reply(check.status, check.message);
        return;
      }
      if (pathname !== MCP_PATH) {
        reply(404, `Not found. The MCP endpoint is ${MCP_PATH}.`);
        return;
      }
      if (req.method !== 'POST') {
        // Stateless server: no standalone SSE stream (GET) and no sessions to end (DELETE).
        reply(405, 'Method not allowed. Send JSON-RPC requests with POST.', { Allow: 'POST' });
        return;
      }

      const body = await readJsonBody(req);
      if (!body.ok) {
        if (body.status === 413) reply(413, 'Request body is too large.');
        else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: invalid JSON' }, id: null }));
        }
        return;
      }

      this.lastRequestAt = Date.now();
      const mcp = createMcpServer(this.host);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body.value);
    } catch (error) {
      console.error('[mcp] Request failed:', error);
      reply(500, 'Internal server error');
    }
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        resolve({ ok: false, status: 413 });
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        resolve({ ok: false, status: 400 });
      }
    });
    req.on('error', () => {
      if (done) return;
      done = true;
      resolve({ ok: false, status: 400 });
    });
  });
}

/** IPC for Settings → AI assistants (MCP). */
export function registerMcpIpc(controller: McpController, send: (state: McpPublicState) => void): void {
  controller.onChange(send);
  ipcMain.handle('mcp:get-state', () => controller.getState());
  ipcMain.handle('mcp:get-token', () => controller.getToken());
  ipcMain.handle('mcp:update', (_, patch: { enabled?: unknown; port?: unknown; allowRiskyTools?: unknown }) =>
    controller.update(patch && typeof patch === 'object' ? patch : {})
  );
  ipcMain.handle('mcp:regenerate-token', () => controller.regenerateToken());
  ipcMain.handle('mcp:retry', () => controller.retry());
}
