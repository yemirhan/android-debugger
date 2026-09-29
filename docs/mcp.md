# Use Android Debugger from AI assistants (MCP)

Android Debugger runs a local [Model Context Protocol](https://modelcontextprotocol.io) server. With it, Claude Code, Codex and other MCP clients can:

- read logs, crashes, network requests, console output and performance data
- take screenshots
- drive the device and app: launch, tap, type, deep links, developer options

The server is part of the desktop app, so keep Android Debugger running while you use it. It keeps collecting data when the window is hidden or on another tab.

## Quick start

1. Open Android Debugger. Go to **Settings → AI assistants (MCP)**, or open the command panel (⌘K) and run **Connect an AI assistant**.
2. Check that the status reads **Running**.
3. Copy the command for your assistant and run it once in a terminal. The commands in Settings already contain the right paths for your install.
4. Ask your assistant something like "Use android-debugger to take a screenshot and show me the latest errors in the logs".

The server listens on `http://127.0.0.1:45321/mcp` by default. You can change the port in Settings.

There are two ways to connect:

- **Local bridge (recommended).** Your assistant starts a small script that ships with the app. The script reads the port and token from Android Debugger's settings file, so no secret goes into your assistant's config. It keeps working when you regenerate the token or change the port.
- **Direct HTTP.** Your assistant connects to the URL with the bearer token. You must update the config each time you regenerate the token or change the port.

The examples below use the default macOS install location:

| What | Path |
| --- | --- |
| App executable | `/Applications/Android Debugger.app/Contents/MacOS/Android Debugger` |
| Bridge script | `/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js` |
| Settings file (port and token) | `~/Library/Application Support/Android Debugger/mcp.json` |

The bridge runs as plain Node.js. The app's own executable runs it when you set `ELECTRON_RUN_AS_NODE=1`, so you don't need to install Node. If you have Node 18 or later, `node /path/to/android-debugger-mcp.js` also works.

## Claude Code

Local bridge (recommended):

```bash
claude mcp add --scope user android-debugger -e ELECTRON_RUN_AS_NODE=1 -- \
  "/Applications/Android Debugger.app/Contents/MacOS/Android Debugger" \
  "/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js"
```

Direct HTTP. Replace `<token>` with the token from Settings, or use the **Copy** button there, which fills it in:

```bash
claude mcp add --scope user --transport http android-debugger http://127.0.0.1:45321/mcp \
  --header "Authorization: Bearer <token>"
```

With `--scope user`, the server is available in all your projects. Leave the flag out to add it to the current project only (local scope). Use `--scope project` to share it through `.mcp.json`. Only share the bridge setup, because the HTTP setup contains your token.

Run `claude mcp list` to check the connection. It shows `✔ Connected` while Android Debugger is running.

## Codex

Local bridge (recommended):

```bash
codex mcp add android-debugger --env ELECTRON_RUN_AS_NODE=1 -- \
  "/Applications/Android Debugger.app/Contents/MacOS/Android Debugger" \
  "/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js"
```

To write the same setup by hand, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.android-debugger]
command = "/Applications/Android Debugger.app/Contents/MacOS/Android Debugger"
args = ["/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js"]
env = { ELECTRON_RUN_AS_NODE = "1" }
```

Direct HTTP. Codex reads the bearer token from an environment variable. Export it in the shell or profile you start Codex from:

```bash
export ANDROID_DEBUGGER_MCP_TOKEN="<token>"
codex mcp add android-debugger --url http://127.0.0.1:45321/mcp --bearer-token-env-var ANDROID_DEBUGGER_MCP_TOKEN
```

That command writes this config:

```toml
[mcp_servers.android-debugger]
url = "http://127.0.0.1:45321/mcp"
bearer_token_env_var = "ANDROID_DEBUGGER_MCP_TOKEN"
```

Codex's default tool timeout is 60 seconds. Installing a large AAB can take longer. If it does, add `tool_timeout_sec = 300` to the table.

Run `codex mcp list` to check the setup.

## Other clients

Clients that use an `mcpServers` JSON file, such as Claude Desktop, Cursor or Windsurf:

```json
{
  "mcpServers": {
    "android-debugger": {
      "command": "/Applications/Android Debugger.app/Contents/MacOS/Android Debugger",
      "args": ["/Applications/Android Debugger.app/Contents/Resources/mcp/android-debugger-mcp.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

Clients that support Streamable HTTP with headers:

```json
{
  "mcpServers": {
    "android-debugger": {
      "type": "http",
      "url": "http://127.0.0.1:45321/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Key names vary between clients; check your client's docs.

### Bridge options

The bridge looks for its settings in this order:

1. `--config /path/to/mcp.json`
2. the `ANDROID_DEBUGGER_MCP_CONFIG` environment variable
3. the default settings folder: `~/Library/Application Support/Android Debugger/mcp.json` on macOS, `%APPDATA%\Android Debugger\mcp.json` on Windows, `~/.config/Android Debugger/mcp.json` on Linux

Development builds and custom `--user-data-dir` profiles keep their settings somewhere else. For those, the commands in Settings add `--config` for you.

## Tools

Most tools take an optional `device` (serial) and `app` (package name). If you leave them out, the tools use the device and app selected in Android Debugger. When the assistant calls `select_device` or `select_app`, the app's UI switches too. When you pick a device or app in the UI, the assistant sees that change.

| Tool | What it does |
| --- | --- |
| `list_devices` | Lists devices and emulators, their status, and the current selection. |
| `select_device` | Selects the device the app works with. The UI follows. |
| `get_device_info` | Shows the model, Android version, API level, ABIs, screen size and density, Wi-Fi and battery. |
| `list_apps` | Lists installed packages. By default it lists only debuggable apps, with an optional filter. |
| `select_app` | Selects the app to inspect. The UI follows. |
| `launch_app` / `stop_app` / `restart_app` | Launches, force-stops or cold-restarts an app. |
| `clear_app_data` ⚠️ | Clears all of an app's data (`pm clear`). |
| `install_app` ⚠️ | Installs an `.apk` or `.aab` file from this computer. |
| `uninstall_app` ⚠️ | Uninstalls an app. |
| `take_screenshot` | Returns the screen as an image and saves the full-size PNG. |
| `start_screen_recording` / `stop_screen_recording` | Records the screen to an `.mp4` file (Android stops recordings at 3 minutes). |
| `get_logs` | Returns logcat lines. Filter by mode (`app`, `rn`, `device`), minimum level, tags, excluded tags, text or regex, `since` (for example `5m` or an ISO time) and `limit` (default 200). |
| `clear_logs` | Clears the device log buffer. |
| `get_crashes` | Shows recent Java and native crashes with stack traces. |
| `get_network_requests` | Shows HTTP requests the SDK captured. Filter by URL, method, status and time. Bodies are optional and truncated. |
| `get_console_logs` | Shows `console.*` output the SDK captured. |
| `get_websocket_messages` | Shows WebSocket connections, messages and events the SDK captured. |
| `get_state_snapshots` | Shows the latest Redux, Zustand or custom state the SDK reported. |
| `get_performance` | Shows current memory, CPU, frame rate and battery, plus min, max and average over recent history. |
| `get_threads` | Lists an app's threads with their state and CPU time. |
| `get_activity_stack` | Shows an app's tasks and activities, and which one has focus. |
| `open_deep_link` | Opens a URL or deep link on the device. |
| `send_intent` | Starts an activity with a custom intent (action, data, component, extras and flags). |
| `input_tap` / `input_swipe` / `input_text` / `press_key` | Taps, swipes, types text or presses a key (HOME, BACK, ENTER, APP_SWITCH and others). |
| `set_dev_option` | Changes a developer option: layout bounds, show touches, pointer location or animation scales. |
| `reload_react_native` / `open_dev_menu` | Reloads the JS bundle or opens the React Native dev menu. Uses a key press, or Metro if you pass `metroPort`. |
| `navigate_ui` | Switches the Android Debugger window to a tab and brings it to the front. |
| `run_shell` ⚠️ | Runs a command in the device shell. |

⚠️ These are risky tools. They are off by default. Until you turn on **Settings → AI assistants (MCP) → Allow risky tools**, calling one returns a message that explains how to enable it.

Where the data comes from:

- **Logs.** The app keeps up to 5,000 lines from the log stream it is already running. If that stream doesn't match the request, or doesn't reach back far enough, `get_logs` reads the device's log buffer instead.
- **Crashes.** Crashes come from the crash stream the app watches. If it captured none, `get_crashes` reads the device's crash buffer instead.
- **Network, console, WebSocket and state.** These need the [SDK](../packages/sdk/README.md) in your app, running as a debug build, and the app selected in Android Debugger.
- **Performance.** History comes from the background monitors. If monitoring is off, `get_performance` reads the current values on demand.

## Security

- The server listens on `127.0.0.1` only. Other machines on your network can't reach it.
- Each request must send `Authorization: Bearer <token>`. The app creates a random 256-bit token on first run and stores it in `mcp.json`. Only your user account can read that file (permissions 0600). You can regenerate the token in Settings.
- The server rejects requests whose `Host` header isn't `127.0.0.1:<port>` or `localhost:<port>`. This blocks DNS rebinding.
- The server rejects requests with an `Origin` other than the server itself. This stops web pages in your browser from calling it.
- Tools that can change or delete data (`run_shell`, `install_app`, `uninstall_app`, `clear_app_data`) stay off until you allow them. Turn them off again when you're done.
- To stop all access, turn off **Local MCP server** in Settings.
- The server has no sessions. Every request is handled on its own, and nothing is kept between requests except the data the app already collects.

## Troubleshooting

- **"Android Debugger is not running"**: open the app. The bridge needs the app running to answer.
- **"The MCP server is turned off"**: turn on **Local MCP server** in Settings.
- **"Port … is already in use"**: another program is using the port. Pick a different one in Settings, then run your `claude mcp add` or `codex mcp add` command again. If you use the bridge, you don't need to change anything.
- **401 "Missing or wrong bearer token"**: the token changed. Copy the new command from Settings, or switch to the bridge.
- **SDK tools return nothing**: the app must call `AndroidDebugger.init()`, run as a debug build, and be the app selected in Android Debugger.
