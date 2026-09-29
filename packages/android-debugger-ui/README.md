# @yemirhan/android-debugger-ui

An in-app debugger and React Native UI components for apps using [`@yemirhan/android-debugger-sdk`](../sdk/README.md).

- **In-app debugger**: a floating button that opens network requests, console output, events and state captured by the SDK, right on the device. It works with or without the desktop app.
- **Hooks** to build your own debug screens from the same data.
- **Components**: JSON viewer, badges, key/value lists, segmented control, search field and more, all in one dark theme.

## Installation

```bash
npm install @yemirhan/android-debugger-ui @yemirhan/android-debugger-sdk
```

Peer dependencies: `react`, `react-native` (0.71+), `@expo/vector-icons`, `expo-router` and `@yemirhan/android-debugger-sdk` (2.0+).

## In-app debugger

Render `DebuggerOverlay` once, next to your root navigator:

```tsx
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import { DebuggerOverlay } from '@yemirhan/android-debugger-ui';

AndroidDebugger.init();

export default function RootLayout() {
  return (
    <>
      <Stack />
      <DebuggerOverlay />
    </>
  );
}
```

A draggable bug button appears (only in development builds by default). Its dot shows whether the desktop app is connected, and a red badge counts errors (`console.error` and failed requests) you haven't looked at yet. Tap it to open the debugger:

| Tab | Shows |
|-----|-------|
| **Network** | fetch, XMLHttpRequest and intercepted axios requests. Filter by URL, method or status, or show only failed/pending ones. Tap a request for headers and bodies (JSON is shown as a tree), and share it as a cURL command. |
| **Console** | `console.*` output, colored by level, with level filters and search. Tap a line to inspect logged objects. |
| **Events** | `trackEvent()` calls, Redux actions and `markStart()`/`markEnd()` timings. |
| **State** | The latest snapshot of each store: `sendState()`, the Redux middleware and `interceptZustandStore()`. |

The header can clear the current tab and reload the app.

React Native's own requests to Metro (LogBox symbolication) are left out, so they don't bury your app's traffic.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enabled` | `boolean` | `__DEV__` | Render nothing when false |
| `initialTab` | `'network' \| 'console' \| 'events' \| 'state'` | `'network'` | Tab shown when opened |

### Embedding the panel

Use `DebuggerPanel` to put the same debugger in a screen of your own, e.g. a hidden debug menu:

```tsx
import { DebuggerPanel } from '@yemirhan/android-debugger-ui';

export default function DebugScreen() {
  return <DebuggerPanel initialTab="console" />;
}
```

| Prop | Type | Description |
|------|------|-------------|
| `initialTab` | `DebuggerTab` | Tab shown first (default `'network'`) |
| `onClose` | `() => void` | Shows a close button |
| `insetTop` | `number` | Extra space above the header |

### What gets captured

Data is recorded from the moment this package is imported, so import it early (your root layout). The newest 300 requests, 500 console lines, 300 events and 100 stores are kept. Everything stays on the device, in memory.

## Hooks

The debugger is built on these hooks; use them for custom screens. Each re-renders when its data changes (in batches, so a burst of logs causes one render).

```tsx
import { useNetworkRequests, useDebuggerConnection } from '@yemirhan/android-debugger-ui';

function FailedRequestCount() {
  const requests = useNetworkRequests();
  const connected = useDebuggerConnection();
  const failed = requests.filter((r) => r.error || (r.status ?? 0) >= 400).length;
  return <Text>{failed} failed · desktop {connected ? 'connected' : 'offline'}</Text>;
}
```

| Hook | Returns |
|------|---------|
| `useDebuggerConnection()` | `boolean`: whether the desktop app is receiving data |
| `useNetworkRequests()` | Requests, oldest first (a request is updated in place when it completes) |
| `useConsoleLogs()` | Console entries, oldest first |
| `useDebuggerEvents()` | Custom events and performance marks, oldest first |
| `useStateSnapshots()` | Latest state per store, most recently updated last |
| `useDebuggerData()` | All of the above in one object |

`clearDebuggerData(kind?)` forgets one kind (`'network'`, `'console'`, `'events'`, `'states'`) or everything.

## Components

All components use the exported `theme` (colors, radii, spacing, fonts), so custom screens can match.

### ConnectionStatus

A badge that shows whether the desktop app is connected. It updates live; pass `connected` to override.

```tsx
<ConnectionStatus />
```

### JsonViewer

A collapsible, syntax-colored tree. Large arrays and objects render 100 children at a time.

```tsx
<JsonViewer data={response} initialExpandDepth={2} />
```

### Badge

```tsx
<Badge label="GET" mono />
<Badge label="404" tone="warning" mono />
<Badge label="live" tone="success" variant="solid" />
```

Tones: `neutral`, `accent`, `success`, `warning`, `danger`, `info`.

### KeyValueList

```tsx
<KeyValueList items={[{ key: 'content-type', value: 'application/json' }]} emptyText="No headers" />
```

### SegmentedControl

```tsx
<SegmentedControl
  value={filter}
  onChange={setFilter}
  options={[
    { value: 'all', label: 'All', count: 12 },
    { value: 'failed', label: 'Failed', count: 2 },
  ]}
/>
```

### SearchField

```tsx
<SearchField value={query} onChangeText={setQuery} placeholder="Filter by URL" />
```

### Section, EmptyState

```tsx
<Section title="Response" action={<Badge label="JSON" />}>
  <JsonViewer data={body} />
</Section>

<EmptyState icon="globe-outline" title="No requests yet" description="They show up here as they happen." />
```

### ActionButton

```tsx
<ActionButton title="Submit" icon="send" variant="primary" loading={false} onPress={submit} />
```

Variants: `primary`, `secondary`, `danger`.

### FeatureCard

A navigation card for expo-router.

```tsx
<FeatureCard title="Console" description="Log messages, warnings, and errors" icon="terminal" href="/console" />
```

### ResultDisplay

A titled, scrollable list of monospace lines.

```tsx
<ResultDisplay title="Output" results={['Line 1', 'Line 2']} maxHeight={200} />
```

## Formatting helpers

`formatTime`, `formatDuration`, `formatBytes`, `requestState` and `toCurl` are exported for custom screens.

## Upgrading from 1.x

- Requires `@yemirhan/android-debugger-sdk` 2.0 or later as a peer dependency.
- `ConnectionStatus` now shows the live connection state instead of a static "SDK Active" badge.
- `FeatureCard` navigates with expo-router's `useRouter()`; its card styling was lost under `<Link asChild>` before.

## License

MIT
