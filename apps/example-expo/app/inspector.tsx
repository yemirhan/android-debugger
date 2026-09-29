import { DebuggerPanel } from '@yemirhan/android-debugger-ui';

// The same panel the floating bug button opens, embedded in a regular screen.
export default function InspectorScreen() {
  return <DebuggerPanel initialTab="console" />;
}
