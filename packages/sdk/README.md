# @android-debugger/sdk

React Native SDK for Android Debugger - sends console logs, network requests, and custom events to the desktop debugging tool.

## Installation

```bash
npm install @android-debugger/sdk
# or
yarn add @android-debugger/sdk
# or
pnpm add @android-debugger/sdk
```

## Quick Start

```typescript
import { AndroidDebugger } from '@android-debugger/sdk';

// Initialize in your app entry point (App.tsx or index.js)
AndroidDebugger.init({
  host: '192.168.1.100', // Your computer's IP address
  port: 8347,            // Default port, must match desktop app
});
```

## Configuration Options

```typescript
AndroidDebugger.init({
  // Required: IP address of the computer running the desktop app
  host: '192.168.1.100',

  // Optional: WebSocket port (default: 8347)
  port: 8347,

  // Optional: Auto-reconnect on disconnect (default: true)
  autoReconnect: true,

  // Optional: Intercept console.log/warn/error (default: true)
  interceptConsole: true,

  // Optional: Intercept fetch/XMLHttpRequest (default: true)
  interceptNetwork: true,

  // Optional: Connection callbacks
  onConnect: () => console.log('Connected to debugger'),
  onDisconnect: () => console.log('Disconnected from debugger'),
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
import { AndroidDebugger } from '@android-debugger/sdk';

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

### `AndroidDebugger.isConnected()`

Check if the SDK is connected to the desktop app.

```typescript
if (AndroidDebugger.isConnected()) {
  console.log('Debugger is connected');
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

### `AndroidDebugger.createReduxMiddleware()`

Create a Redux middleware for automatic action/state tracking.

## Finding Your Computer's IP Address

### macOS
```bash
ipconfig getifaddr en0
```

### Windows
```bash
ipconfig
# Look for "IPv4 Address" under your active network adapter
```

### Linux
```bash
hostname -I | awk '{print $1}'
```

## Troubleshooting

### Connection Issues

1. **Ensure both devices are on the same network** - Your phone and computer must be connected to the same WiFi network.

2. **Check firewall settings** - Make sure port 8347 (or your configured port) is not blocked.

3. **Verify the IP address** - The IP address can change. Re-check it if connection fails.

4. **Start the desktop app first** - The WebSocket server must be running before the SDK tries to connect.

### Console/Network Not Captured

- Make sure `interceptConsole` and `interceptNetwork` are not set to `false`
- Initialize the SDK as early as possible in your app lifecycle
- The SDK must be initialized before the console/network calls you want to capture

## Example: Complete Setup

```typescript
// App.tsx
import React, { useEffect } from 'react';
import { AndroidDebugger } from '@android-debugger/sdk';

// Initialize outside component to run once
if (__DEV__) {
  AndroidDebugger.init({
    host: '192.168.1.100',
    port: 8347,
  });
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
