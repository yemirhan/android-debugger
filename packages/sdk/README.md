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

> **Note:** The SDK communicates with the desktop app via ADB logcat - no network configuration required. Just make sure your device is connected via USB or wireless ADB.

## Configuration Options

```typescript
AndroidDebugger.init({
  // Optional: Intercept console.log/warn/error (default: true)
  interceptConsole: true,

  // Optional: Intercept fetch/XMLHttpRequest (default: true)
  interceptNetwork: true,
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

The SDK communicates with the desktop app via ADB logcat. When you call SDK methods, messages are written to the Android log with a special tag. The desktop app captures these messages by running `adb logcat` and parsing the output.

This means:
- **No network configuration required** - No IP addresses or ports to configure
- **Works over USB or wireless ADB** - Just connect your device via USB or set up wireless debugging
- **No firewall issues** - Communication happens through ADB, not network sockets

## Troubleshooting

### Messages Not Appearing in Desktop App

1. **Check ADB connection** - Run `adb devices` to verify your device is connected
2. **Restart ADB** - Try `adb kill-server && adb start-server`
3. **Check USB debugging** - Ensure USB debugging is enabled on your device

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
