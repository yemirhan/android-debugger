import { useSyncExternalStore } from 'react';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import { debuggerStore, type DebuggerData } from './store';

/** Everything the in-app debugger has captured; re-renders when it changes. */
export function useDebuggerData(): DebuggerData {
  return useSyncExternalStore(debuggerStore.subscribe, debuggerStore.getSnapshot, debuggerStore.getSnapshot);
}

/** HTTP requests (fetch, XHR, axios), oldest first. */
export function useNetworkRequests(): DebuggerData['network'] {
  return useDebuggerData().network;
}

/** console.* calls captured by the SDK, oldest first. */
export function useConsoleLogs(): DebuggerData['console'] {
  return useDebuggerData().console;
}

/** Custom events (trackEvent, Redux actions) and performance marks, oldest first. */
export function useDebuggerEvents(): DebuggerData['events'] {
  return useDebuggerData().events;
}

/** Latest snapshot per store (sendState, Redux, Zustand), most recently updated last. */
export function useStateSnapshots(): DebuggerData['states'] {
  return useDebuggerData().states;
}

const subscribeConnection = (onChange: () => void) => AndroidDebugger.onConnectionChange(onChange);
const getConnection = () => AndroidDebugger.isConnected();

/** Whether the Android Debugger desktop app is connected and receiving data. */
export function useDebuggerConnection(): boolean {
  return useSyncExternalStore(subscribeConnection, getConnection, getConnection);
}
