/**
 * Copy-paste setup snippets for connecting AI assistants to the local MCP
 * server. Pure (type-only imports) so it is unit tested from
 * src/main/mcp-setup.test.ts.
 */
import type { McpSetupInfo } from '../../main/mcp-types';

export const MCP_SERVER_NAME = 'android-debugger';
export const MCP_TOKEN_ENV = 'ANDROID_DEBUGGER_MCP_TOKEN';

export interface McpSnippetInput {
  url: string;
  setup: McpSetupInfo;
  /** The real token, or a placeholder when it should not be shown. */
  token: string;
}

export interface McpSnippet {
  id: string;
  title: string;
  description: string;
  language: 'shell' | 'toml' | 'json';
  code: string;
  /** True when `code` contains the token (copying needs the real one). */
  containsToken: boolean;
}

export interface McpClientGuide {
  id: 'claude-code' | 'codex' | 'other';
  label: string;
  snippets: McpSnippet[];
}

/** Double-quotes a value for POSIX shells (zsh/bash). */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

/** The bridge command line: the app binary runs the script as plain Node. */
export function bridgeArgs(setup: McpSetupInfo): string[] {
  return [setup.bridgePath, ...(setup.configIsDefault ? [] : ['--config', setup.configPath])];
}

export function buildMcpGuides({ url, setup, token }: McpSnippetInput): McpClientGuide[] {
  const args = bridgeArgs(setup);
  const bridgeCommand = [shellQuote(setup.runtimePath), ...args.map(shellQuote)].join(' ');
  const header = `Authorization: Bearer ${token}`;

  const claude: McpSnippet[] = [
    {
      id: 'claude-bridge',
      title: 'Recommended: local bridge',
      description:
        'Claude Code starts the bridge, which reads the token from Android Debugger itself, so no secret ends up in your config. ' +
        '--scope user makes it available in every project; leave it out to add it to the current project only.',
      language: 'shell',
      code: `claude mcp add --scope user ${MCP_SERVER_NAME} -e ELECTRON_RUN_AS_NODE=1 -- ${bridgeCommand}`,
      containsToken: false,
    },
    {
      id: 'claude-http',
      title: 'Direct HTTP',
      description: 'Connects straight to the server. Run it again if you regenerate the token or change the port.',
      language: 'shell',
      code: `claude mcp add --scope user --transport http ${MCP_SERVER_NAME} ${url} --header ${shellQuote(header)}`,
      containsToken: true,
    },
  ];

  const tomlBridge = [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = ${tomlString(setup.runtimePath)}`,
    `args = [${args.map(tomlString).join(', ')}]`,
    `env = { ELECTRON_RUN_AS_NODE = "1" }`,
  ].join('\n');

  const codex: McpSnippet[] = [
    {
      id: 'codex-bridge',
      title: 'Recommended: local bridge',
      description: 'Adds the bridge to ~/.codex/config.toml. The token is read from Android Debugger at runtime.',
      language: 'shell',
      code: `codex mcp add ${MCP_SERVER_NAME} --env ELECTRON_RUN_AS_NODE=1 -- ${bridgeCommand}`,
      containsToken: false,
    },
    {
      id: 'codex-toml',
      title: 'Or edit ~/.codex/config.toml',
      description: 'The same bridge setup, written by hand.',
      language: 'toml',
      code: tomlBridge,
      containsToken: false,
    },
    {
      id: 'codex-http',
      title: 'Direct HTTP',
      description: `Codex reads the bearer token from ${MCP_TOKEN_ENV}; export it in the shell (or profile) you start Codex from.`,
      language: 'shell',
      code: [
        `export ${MCP_TOKEN_ENV}=${shellQuote(token)}`,
        `codex mcp add ${MCP_SERVER_NAME} --url ${url} --bearer-token-env-var ${MCP_TOKEN_ENV}`,
      ].join('\n'),
      containsToken: true,
    },
  ];

  const jsonBridge = JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: { command: setup.runtimePath, args, env: { ELECTRON_RUN_AS_NODE: '1' } },
      },
    },
    null,
    2
  );
  const jsonHttp = JSON.stringify(
    { mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2
  );

  const other: McpSnippet[] = [
    {
      id: 'json-bridge',
      title: 'Stdio (most clients)',
      description: 'For clients configured with an "mcpServers" JSON file, such as Claude Desktop, Cursor or Windsurf.',
      language: 'json',
      code: jsonBridge,
      containsToken: false,
    },
    {
      id: 'json-http',
      title: 'Streamable HTTP',
      description: 'For clients that support remote servers with headers. Key names vary by client.',
      language: 'json',
      code: jsonHttp,
      containsToken: true,
    },
  ];

  return [
    { id: 'claude-code', label: 'Claude Code', snippets: claude },
    { id: 'codex', label: 'Codex', snippets: codex },
    { id: 'other', label: 'Other clients', snippets: other },
  ];
}
