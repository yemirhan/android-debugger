import { useEffect, useMemo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';
import { createStore } from '@/store/redux';
import { useCounterStore, useTodoStore } from '@/store/zustand';
import { setupAxiosInterceptor } from '@/utils/api';

export default function RootLayout() {
  const store = useMemo(() => createStore(), []);

  useEffect(() => {
    // Initialize the Android Debugger SDK
    // No host/port configuration needed - messages are sent via logcat
    // and captured by the desktop app through ADB
    AndroidDebugger.init({
      interceptConsole: true,
      interceptNetwork: true,
      interceptWebSocket: true,
    });

    // Setup axios interceptor
    const restoreAxios = setupAxiosInterceptor();

    // Intercept Zustand stores
    const restoreCounterStore = AndroidDebugger.interceptZustandStore(useCounterStore, 'counter');
    const restoreTodoStore = AndroidDebugger.interceptZustandStore(useTodoStore, 'todos');

    return () => {
      restoreAxios();
      restoreCounterStore();
      restoreTodoStore();
      AndroidDebugger.destroy();
    };
  }, []);

  return (
    <Provider store={store}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a1a2e',
          },
          headerTintColor: '#f9fafb',
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: '#0f0f1a',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Android Debugger',
          }}
        />
        <Stack.Screen
          name="console"
          options={{
            title: 'Console',
          }}
        />
        <Stack.Screen
          name="network"
          options={{
            title: 'Network',
          }}
        />
        <Stack.Screen
          name="events"
          options={{
            title: 'Custom Events',
          }}
        />
        <Stack.Screen
          name="state"
          options={{
            title: 'State Snapshots',
          }}
        />
        <Stack.Screen
          name="performance"
          options={{
            title: 'Performance',
          }}
        />
        <Stack.Screen
          name="redux"
          options={{
            title: 'Redux',
          }}
        />
        <Stack.Screen
          name="zustand"
          options={{
            title: 'Zustand',
          }}
        />
        <Stack.Screen
          name="websocket"
          options={{
            title: 'WebSocket',
          }}
        />
      </Stack>
    </Provider>
  );
}
