import type { SdkMessage, ZustandStoreSnapshot } from '@android-debugger/shared';

type SendFn = (message: SdkMessage) => void;

interface ZustandStore {
  getState: () => unknown;
  subscribe: (listener: (state: unknown, prevState: unknown) => void) => () => void;
}

/**
 * Intercept a Zustand store to track state changes
 *
 * @example
 * import { create } from 'zustand';
 * import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
 *
 * const useStore = create((set) => ({
 *   count: 0,
 *   increment: () => set((state) => ({ count: state.count + 1 })),
 * }));
 *
 * // After SDK is initialized
 * AndroidDebugger.interceptZustandStore(useStore, 'counter');
 */
export function interceptZustandStore(
  store: ZustandStore,
  name: string,
  send: SendFn
): () => void {
  // Send initial state
  const initialState = store.getState();
  const initialSnapshot: ZustandStoreSnapshot = {
    name,
    state: initialState,
    timestamp: Date.now(),
  };

  send({
    type: 'zustand',
    timestamp: Date.now(),
    payload: initialSnapshot,
  });

  // Subscribe to state changes
  const unsubscribe = store.subscribe((state, prevState) => {
    const snapshot: ZustandStoreSnapshot = {
      name,
      state,
      previousState: prevState,
      timestamp: Date.now(),
    };

    send({
      type: 'zustand',
      timestamp: Date.now(),
      payload: snapshot,
    });
  });

  return unsubscribe;
}
