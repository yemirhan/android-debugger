import { useEffect, useState, createContext, useContext, useMemo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { AndroidDebugger } from '@android-debugger/sdk';
import { createStore } from '@/store/redux';
import { setupAxiosInterceptor } from '@/utils/api';

// Connection context
interface ConnectionContextType {
  isConnected: boolean;
}

const ConnectionContext = createContext<ConnectionContextType>({ isConnected: false });

export function useConnection() {
  return useContext(ConnectionContext);
}

export default function RootLayout() {
  const [isConnected, setIsConnected] = useState(false);
  const store = useMemo(() => createStore(), []);

  useEffect(() => {
    // Initialize the Android Debugger SDK
    // Replace with your computer's IP address when running on a physical device
    AndroidDebugger.init({
      host: '192.168.68.106', // TODO: Update with your computer's IP
      port: 8347,
      autoReconnect: true,
      interceptConsole: true,
      interceptNetwork: true,
      onConnect: () => {
        setIsConnected(true);
        console.log('Connected to Android Debugger');
      },
      onDisconnect: () => {
        setIsConnected(false);
        console.log('Disconnected from Android Debugger');
      },
    });

    // Setup axios interceptor
    const restoreAxios = setupAxiosInterceptor();

    return () => {
      restoreAxios();
      AndroidDebugger.destroy();
    };
  }, []);

  return (
    <ConnectionContext.Provider value={{ isConnected }}>
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
        </Stack>
      </Provider>
    </ConnectionContext.Provider>
  );
}
