# @yemirhan/android-debugger-ui

Reusable React Native UI components for building Android debugging tools and developer utilities.

## Installation

```bash
npm install @yemirhan/android-debugger-ui
# or
yarn add @yemirhan/android-debugger-ui
# or
pnpm add @yemirhan/android-debugger-ui
```

### Peer Dependencies

This package requires the following peer dependencies:

```bash
npm install react react-native @expo/vector-icons expo-router
```

## Components

### ActionButton

A customizable button with icon support, loading state, and multiple variants.

```tsx
import { ActionButton } from '@yemirhan/android-debugger-ui';

<ActionButton
  title="Submit"
  onPress={() => console.log('pressed')}
  icon="send"
  variant="primary"
  loading={false}
  disabled={false}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | required | Button text |
| `onPress` | `() => void` | required | Press handler |
| `icon` | `Ionicons.glyphMap` | - | Optional Ionicons icon name |
| `variant` | `'primary' \| 'secondary' \| 'danger'` | `'primary'` | Button style variant |
| `loading` | `boolean` | `false` | Shows loading spinner |
| `disabled` | `boolean` | `false` | Disables the button |

---

### FeatureCard

A navigation card with icon, title, description, and link support via expo-router.

```tsx
import { FeatureCard } from '@yemirhan/android-debugger-ui';

<FeatureCard
  title="Console"
  description="Log messages, warnings, and errors"
  icon="terminal"
  href="/console"
/>
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Card title |
| `description` | `string` | Card description |
| `icon` | `Ionicons.glyphMap` | Ionicons icon name |
| `href` | `string` | Navigation path (expo-router) |

---

### ConnectionStatus

A badge component displaying SDK connection status.

```tsx
import { ConnectionStatus } from '@yemirhan/android-debugger-ui';

<ConnectionStatus />
```

---

### ResultDisplay

A scrollable container for displaying results with monospace formatting.

```tsx
import { ResultDisplay } from '@yemirhan/android-debugger-ui';

<ResultDisplay
  title="Output"
  results={['Line 1', 'Line 2', 'Line 3']}
  maxHeight={200}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | required | Section title |
| `results` | `string[]` | required | Array of result strings |
| `maxHeight` | `number` | `200` | Maximum height before scrolling |

## Usage Example

```tsx
import {
  ActionButton,
  FeatureCard,
  ConnectionStatus,
  ResultDisplay
} from '@yemirhan/android-debugger-ui';
import { View } from 'react-native';
import { useState } from 'react';

export default function DebugScreen() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    setLoading(true);
    // ... perform action
    setResults(prev => [...prev, 'Action completed']);
    setLoading(false);
  };

  return (
    <View>
      <ConnectionStatus />

      <FeatureCard
        title="Network"
        description="Monitor network requests"
        icon="globe"
        href="/network"
      />

      <ActionButton
        title="Run Action"
        onPress={handleAction}
        icon="play"
        loading={loading}
      />

      <ResultDisplay
        title="Results"
        results={results}
      />
    </View>
  );
}
```

## License

MIT
