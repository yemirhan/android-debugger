# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Android Debugger is a React Native debugging tool with an Electron desktop app and reusable SDK/UI packages. The SDK communicates with the desktop app via ADB logcat - messages are written to Android logs with a special tag and captured by the desktop app running `adb logcat`.

## Monorepo Structure

```
apps/
  desktop/          # Electron + React + Tailwind desktop app
  example-expo/     # Example React Native app using the SDK
packages/
  sdk/              # @yemirhan/android-debugger-sdk (npm published)
  android-debugger-ui/  # @yemirhan/android-debugger-ui (npm published)
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
- **Logcat parser** (`src/main/logcat-parser.ts`): Parses SDK messages from logcat stream

Key contexts in renderer: LogsContext, SDKContext, UpdateContext, CrashContext

### SDK Package (packages/sdk)
- Singleton `AndroidDebugger` class - call `AndroidDebugger.init()` once at app startup
- Interceptors: console, fetch/XHR, axios, websocket, zustand
- Transport via logcat (`src/transports/logcat.ts`)
- Redux middleware via `AndroidDebugger.createReduxMiddleware()`

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

- SDK messages use logcat tag for identification - no network config needed
- Desktop monitors: memory, CPU, FPS, battery, network stats
- App installation supports APK and AAB (bundletool downloaded on-demand)
- Auto-updates via electron-updater with macOS notarization
