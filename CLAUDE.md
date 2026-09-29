# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Android Debugger is a React Native debugging tool with an Electron desktop app and reusable SDK/UI packages. The SDK (2+) sends messages over a WebSocket to `localhost:8347` on the device, which the desktop app forwards to itself with `adb reverse`, so nothing lands in the app's logs. SDK 1.x wrote messages to logcat instead; the desktop still parses those for compatibility.

## Monorepo Structure

```
apps/
  desktop/          # Electron + React + Tailwind desktop app
  example-expo/     # Example React Native app using the SDK
packages/
  sdk/              # @yemirhan/android-debugger-sdk (npm published)
  android-debugger-ui/  # @yemirhan/android-debugger-ui (npm published): in-app debugger + RN components
  shared/           # @android-debugger/shared (internal types)
```

## Commands

```bash
# Development
pnpm install        # Install all dependencies
pnpm dev            # Start all packages in dev mode (uses turbo)
pnpm dev:example    # Start example Expo app only

# Building
pnpm build          # Build all packages
pnpm lint           # Lint all packages

# Desktop app (from apps/desktop)
pnpm package        # Build unsigned macOS app
pnpm package:signed # Build signed/notarized macOS app
pnpm publish:signed # Publish signed app to GitHub releases

# SDK/UI publishing (from root)
pnpm publish:packages  # Publish SDK and UI packages to npm
```

## Architecture

### Desktop App (apps/desktop)
- **Main process** (`src/main/index.ts`): Electron main, IPC handlers for 40+ ADB operations
- **Renderer** (`src/renderer/App.tsx`): React frontend with tabbed interface
- **ADB service** (`src/main/adb.ts`): Device communication, command execution
- **SDK bridge** (`src/main/sdk-bridge.ts`, `sdk-bridge-server.ts`): WebSocket server per selected device on an ephemeral 127.0.0.1 port, `adb reverse`d from the device's SDK port; hello/welcome handshake then batched messages
- **Logcat parser** (`src/main/logcat-parser.ts`): Parses SDK 1.x messages from the logcat stream
- **MCP server** (`src/main/mcp-*.ts`): Local Streamable HTTP MCP server on 127.0.0.1 (bearer token, Host/Origin checks) whose tools reuse AdbService; `mcp-store.ts` keeps bounded copies of the streams sent to the renderer; `mcp-bridge.ts` is the standalone stdio bridge shipped in `Resources/mcp/`. User docs: `docs/mcp.md`

Key contexts in renderer: LogsContext, SDKContext, UpdateContext, CrashContext

### SDK Package (packages/sdk)
- Singleton `AndroidDebugger` class - call `AndroidDebugger.init()` once at app startup
- Interceptors: console, fetch/XHR, axios, websocket, zustand
- Transport: `src/transports/websocket.ts` (default; queues while disconnected, reconnects with backoff, never logs) or the legacy `logcat.ts` (opt-in via `transport: 'logcat'`)
- Tests: `pnpm test` builds and runs `test/*.test.mjs` against `dist`
- Redux middleware via `AndroidDebugger.createReduxMiddleware()`

### UI Package (packages/android-debugger-ui)
- `DebuggerOverlay` (floating bug button) / `DebuggerPanel`: on-device Network, Console, Events and State tabs
- Data comes from `AndroidDebugger.onMessage()` into `src/store.ts` (bounded, batched, immutable snapshots) and is read through `useSyncExternalStore` hooks
- `src/store.ts` and `src/format.ts` are free of React Native imports so `pnpm test` can run them in Node; everything shares `src/theme.ts`
- Peer-depends on the SDK (>= 2.0)

### IPC Pattern
Desktop uses Electron IPC for main↔renderer communication. Handlers are registered in main process, invoked from renderer via `window.api.*` methods exposed through preload script.

## Build Configuration

- **Turbo** (`turbo.json`): Task orchestration with caching
- **TypeScript**: ES2022 target, strict mode, bundler resolution (`tsconfig.base.json`)
- **Desktop**: electron-vite for build, electron-builder for packaging
- **SDK/UI**: tsup for bundling

## Release Process

1. Update version in relevant package.json files
2. Create git tag: `git tag v1.x.x`
3. Push tag: `git push origin v1.x.x`
4. GitHub Actions workflow builds and publishes signed macOS app to GitHub Releases

Required secrets for CI: `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `GH_TOKEN`

## Key Technical Details

- SDK bridge protocol lives in `packages/shared` (`SDK_BRIDGE_DEVICE_PORT`, `SDK_BRIDGE_PROTOCOL_VERSION`, frame types); bump the protocol version for incompatible changes
- Desktop monitors: memory, CPU, FPS, battery, network stats
- App installation supports APK and AAB (bundletool downloaded on-demand)
- Auto-updates via electron-updater with macOS notarization
