# @yemirhan/android-debugger-sdk

React Native SDK for Android Debugger - sends console logs, network requests, and custom events to the desktop debugging tool.

## Installation

```bash
npm install @yemirhan/android-debugger-sdk
# or
yarn add @yemirhan/android-debugger-sdk
# or
pnpm add @yemirhan/android-debugger-sdk
```

## Quick Start

```typescript
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';

// Initialize in your app entry point (App.tsx or index.js)
AndroidDebugger.init();
```

> **Note:** No network configuration required. The SDK connects to `localhost` on the device, and the desktop app forwards that port to itself with `adb reverse`. Just make sure your device is connected via USB or wireless ADB, and selected in Android Debugger.

The SDK never writes its traffic to the app's logs. Your Metro terminal, React Native DevTools console and `adb logcat` only show what your app logs itself.

## Configuration Options

```typescript
AndroidDebugger.init({
  // Optional: Intercept console.log/warn/error (default: true)
  interceptConsole: true,

  // Optional: Intercept fetch/XMLHttpRequest (default: true)
  interceptNetwork: true,

  // Optional: Intercept WebSocket connections (default: false)
  interceptWebSocket: false,

  // Optional: Messages kept while the desktop app isn't connected (default: 1000)
  maxQueueSize: 1000,

  // Optional: Device port the SDK connects to (default: 8347)
  port: 8347,

  // Optional: 'websocket' (default) or 'logcat' (SDK 1.x transport, see below)
  transport: 'websocket',
});
```

## Features

### Automatic Console Capture

All `console.log`, `console.info`, `console.warn`, `console.error`, and `console.debug` calls are automatically sent to the desktop app.

```typescript
console.log('User logged in', { userId: 123 });
console.error('Failed to load data', error);
```

### Automatic Network Capture

All `fetch()` and `XMLHttpRequest` calls are automatically captured, including:
- Request URL, method, headers, body
- Response status, headers, body
- Request duration
- Errors

```typescript
// Automatically captured
const response = await fetch('https://api.example.com/users');
const data = await response.json();
```

React Native's own requests to Metro (LogBox symbolication, "open in editor") are not captured, so they don't bury your app's traffic.

### Axios Support

For Axios users, you can intercept Axios instances for more reliable request tracking:

```typescript
import axios from 'axios';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';

// Initialize the SDK first
AndroidDebugger.init();

// Create your axios instance
const api = axios.create({
  baseURL: 'https://api.example.com',
});

// Intercept the axios instance
AndroidDebugger.interceptAxios(api);

// All requests through this instance are now tracked
const response = await api.get('/users');
```

You can intercept multiple axios instances:

```typescript
const publicApi = axios.create({ baseURL: 'https://public-api.example.com' });
const privateApi = axios.create({ baseURL: 'https://private-api.example.com' });

AndroidDebugger.interceptAxios(publicApi);
AndroidDebugger.interceptAxios(privateApi);

// You can also intercept the global axios instance
import axios from 'axios';
AndroidDebugger.interceptAxios(axios);
```

The interceptor captures:
- Request URL (with baseURL resolution)
- Request method, headers, body
- Response status, headers, body (including error responses)
- Request duration
- Network errors and timeouts

### Custom Events

Track custom events with arbitrary data:

```typescript
// Track a button press
AndroidDebugger.trackEvent('button_press', {
  buttonId: 'submit',
  screen: 'login'
});

// Track a screen view
AndroidDebugger.trackEvent('screen_view', {
  screen: 'HomeScreen'
});

// Track any custom event
AndroidDebugger.trackEvent('purchase_completed', {
  productId: 'abc123',
  price: 9.99
});
```

### State Snapshots

Send snapshots of your app state for debugging:

```typescript
// Send current user state
AndroidDebugger.sendState('user', {
  id: 123,
  name: 'John',
  isLoggedIn: true,
});

// Send navigation state
AndroidDebugger.sendState('navigation', {
  currentScreen: 'Home',
  history: ['Login', 'Home'],
});
```

### Performance Marks

Measure the duration of operations:

```typescript
// Start timing
AndroidDebugger.markStart('api_call');

// ... do some work ...
const data = await fetchUserData();

// End timing - automatically sends duration to desktop
AndroidDebugger.markEnd('api_call');
```

### Redux Integration

Use the built-in Redux middleware to automatically track actions and state:

```typescript
import { createStore, applyMiddleware } from 'redux';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';

const store = createStore(
  rootReducer,
  applyMiddleware(
    AndroidDebugger.createReduxMiddleware(),
    // ... other middleware
  )
);
```

This will automatically:
- Send every dispatched action as a custom event
- Send state snapshots after each action

## API Reference

### `AndroidDebugger.init(options)`

Initialize the SDK. Call this once at app startup.

### `AndroidDebugger.destroy()`

Disconnect and cleanup. Call this when you want to stop debugging.

```typescript
AndroidDebugger.destroy();
```

### `AndroidDebugger.isReady()`

Check if the SDK is initialized and ready to send messages.

```typescript
if (AndroidDebugger.isReady()) {
  console.log('Debugger is ready');
}
```

### `AndroidDebugger.isConnected()`

Check if the desktop app is connected and receiving messages. Messages sent while it isn't are queued and delivered when it connects.

### `AndroidDebugger.onConnectionChange(listener)`

Listen for the desktop app connecting or disconnecting. Returns a function that removes the listener. Listeners survive `destroy()` and `init()`.

```typescript
const unsubscribe = AndroidDebugger.onConnectionChange((connected) => {
  setDebuggerConnected(connected);
});
```

### `AndroidDebugger.onMessage(listener)`

Observe every message the SDK captures, inside the app itself, whether or not the desktop app is connected. Each message is a snapshot taken when it was captured. Returns a function that removes the listener. [`@yemirhan/android-debugger-ui`](../android-debugger-ui/README.md)'s in-app debugger is built on this.

```typescript
const unsubscribe = AndroidDebugger.onMessage((message) => {
  if (message.type === 'network') trackSlowRequests(message.payload);
});
```

### `AndroidDebugger.trackEvent(name, data?)`

Send a custom event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Event name |
| `data` | `any` | Optional event data |

### `AndroidDebugger.sendState(name, state)`

Send a state snapshot.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | State identifier |
| `state` | `any` | State object |

### `AndroidDebugger.markStart(name)`

Start a performance measurement.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Measurement name |

### `AndroidDebugger.markEnd(name)`

End a performance measurement and send the result.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Measurement name (must match `markStart`) |

### `AndroidDebugger.interceptAxios(axiosInstance)`

Intercept an Axios instance for network request tracking.

| Parameter | Type | Description |
|-----------|------|-------------|
| `axiosInstance` | `AxiosInstance` | The axios instance to intercept |

Returns a function to remove the interceptor:

```typescript
const removeInterceptor = AndroidDebugger.interceptAxios(api);

// Later, to stop intercepting:
removeInterceptor();
```

### `AndroidDebugger.createReduxMiddleware()`

Create a Redux middleware for automatic action/state tracking.

## How It Works

The SDK opens a WebSocket to `ws://localhost:8347` on the device. When you select the device in Android Debugger, the desktop app runs `adb reverse tcp:8347 tcp:<port>`, so that connection is tunneled through ADB to the desktop app. It's the same mechanism Metro uses.

This means:
- **Clean logs** - Nothing the SDK sends shows up in Metro, React Native DevTools or `adb logcat`
- **No network configuration required** - No IP addresses to configure; works over USB, wireless ADB and on emulators
- **No firewall issues** - Traffic goes through ADB, not your Wi-Fi network
- **Nothing lost at startup** - Messages captured before the desktop app connects are queued (up to `maxQueueSize`, oldest dropped first) and delivered once it does
- **No size limits** - Large responses and state snapshots aren't split into log lines

The SDK retries the connection in the background, so you can start the app and the desktop app in any order.

### Release builds

Android blocks cleartext (`ws://`) traffic in release builds by default. Debug builds of React Native and Expo apps already allow it. If you ship the SDK in a release or staging build, allow cleartext to `localhost` with a [network security config](https://developer.android.com/privacy-and-security/security-config):

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
```

### Logcat transport (legacy)

SDK 1.x wrote every message to logcat through `console.log`, which flooded Metro and React Native DevTools. It's still available as `transport: 'logcat'` for setups where `adb reverse` can't be used. It has no connection status (`isConnected()` is always false) and payloads are split into log lines.

## Upgrading from 1.x

- Needs Android Debugger desktop 1.11 or later (older versions only read logcat).
- Nothing to change in your code. `init()` options from 1.x work as before.
- `AndroidDebugger.init()` no longer logs a startup message.

## In-App Debugger

[`@yemirhan/android-debugger-ui`](../android-debugger-ui/README.md) adds a floating button that opens the captured network requests, console output, events and state on the device itself:

```tsx
import { DebuggerOverlay } from '@yemirhan/android-debugger-ui';

// Next to your root navigator
<DebuggerOverlay />
```

## Troubleshooting

### Messages Not Appearing in Desktop App

1. **Check the connection badge** - The SDK Data panel shows "App connected" once the app is talking to the desktop app
2. **Check ADB connection** - Run `adb devices` to verify your device is connected, and select it in Android Debugger
3. **Check the port forward** - `adb reverse --list` should show `tcp:8347`. Android Debugger re-applies it every few seconds while no app is connected
4. **Release builds** - Allow cleartext traffic to `localhost` (see [Release builds](#release-builds))
5. **Restart ADB** - Try `adb kill-server && adb start-server`

### Console/Network Not Captured

- Make sure `interceptConsole` and `interceptNetwork` are not set to `false`
- Initialize the SDK as early as possible in your app lifecycle
- The SDK must be initialized before the console/network calls you want to capture

## Example: Complete Setup

```typescript
// App.tsx
import React, { useEffect } from 'react';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';

// Initialize outside component to run once
if (__DEV__) {
  AndroidDebugger.init();
}

export default function App() {
  useEffect(() => {
    AndroidDebugger.trackEvent('app_started');

    return () => {
      // Cleanup on unmount (optional)
      AndroidDebugger.destroy();
    };
  }, []);

  return (
    // Your app content
  );
}
```

## License

MIT
