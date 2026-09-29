# Android Debugger

A desktop app for debugging Android devices and React Native apps: logs, crashes, network, performance, screen mirroring, React Native DevTools and more. It talks to devices over adb. The optional SDK adds network, console and state data from your React Native app.

## Packages

| Path | What it is |
| --- | --- |
| `apps/desktop` | The Electron desktop app |
| `packages/sdk` | [`@yemirhan/android-debugger-sdk`](packages/sdk/README.md), the React Native SDK |
| `packages/android-debugger-ui` | `@yemirhan/android-debugger-ui`, UI helpers |
| `packages/shared` | Types shared by the app and the SDK |

## AI assistants (MCP)

Android Debugger includes a local MCP server. Claude Code, Codex and other assistants can use it to read logs, crashes, network and performance data, take screenshots, and drive the device.

To connect an assistant, open **Settings → AI assistants (MCP)** in the app and copy the command for your assistant. For example, for Claude Code:

```bash
claude mcp add --scope user android-debugger -e ELECTRON_RUN_AS_NODE=1 -- \
  "/Applications/Android Debugger.app/Contents/MacOS/Android Debugger" \
  "/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js"
```

See [docs/mcp.md](docs/mcp.md) for Codex and other clients, the full list of tools, and security notes.

## Development

```bash
pnpm install
pnpm dev     # all packages in dev mode
pnpm build   # build everything
```

From `apps/desktop`: `pnpm typecheck`, `pnpm test`, `pnpm package`.
