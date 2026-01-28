import { useState, useRef, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
} from 'react-native';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Message {
  id: string;
  type: 'sent' | 'received' | 'system';
  data: string;
  timestamp: number;
}

export default function WebSocketScreen() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [url, setUrl] = useState('wss://echo.websocket.org');
  const wsRef = useRef<WebSocket | null>(null);

  const addMessage = useCallback((type: Message['type'], data: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random(),
        type,
        data,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    addMessage('system', `Connecting to ${url}...`);

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setStatus('connected');
        addMessage('system', 'Connected!');
      };

      ws.onmessage = (event) => {
        addMessage('received', event.data);
      };

      ws.onerror = () => {
        setStatus('error');
        addMessage('system', 'Connection error');
      };

      ws.onclose = () => {
        setStatus('disconnected');
        addMessage('system', 'Disconnected');
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (error) {
      setStatus('error');
      addMessage('system', `Failed to connect: ${error}`);
    }
  }, [url, addMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && inputText.trim()) {
      wsRef.current.send(inputText);
      addMessage('sent', inputText);
      setInputText('');
    }
  }, [inputText, addMessage]);

  const sendJson = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const json = JSON.stringify({
        type: 'test',
        data: { timestamp: Date.now(), message: 'Hello from Android Debugger!' },
      });
      wsRef.current.send(json);
      addMessage('sent', json);
    }
  }, [addMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return '#10b981';
      case 'connecting':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          WebSocket connections and messages are automatically tracked.
          Check the WebSocket panel in the desktop app to see all traffic!
        </Text>
      </View>

      {/* Connection Controls */}
      <View style={styles.section}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={setUrl}
          placeholder="WebSocket URL"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.buttonRow}>
          {status === 'disconnected' || status === 'error' ? (
            <TouchableOpacity style={[styles.button, styles.connectButton]} onPress={connect}>
              <Text style={styles.buttonText}>Connect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.button, styles.disconnectButton]} onPress={disconnect}>
              <Text style={styles.buttonText}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Send Message */}
      {status === 'connected' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Message</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.messageInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor="#6b7280"
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
              <Text style={styles.buttonText}>Send</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.button, styles.jsonButton]} onPress={sendJson}>
            <Text style={styles.buttonText}>Send JSON Example</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <View style={styles.messagesSection}>
        <View style={styles.messagesHeader}>
          <Text style={styles.sectionTitle}>Messages</Text>
          <TouchableOpacity onPress={clearMessages}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.messagesList} contentContainerStyle={styles.messagesContent}>
          {messages.length > 0 ? (
            messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.messageItem,
                  msg.type === 'sent' && styles.messageSent,
                  msg.type === 'received' && styles.messageReceived,
                  msg.type === 'system' && styles.messageSystem,
                ]}
              >
                <View style={styles.messageHeader}>
                  <Text style={styles.messageType}>
                    {msg.type === 'sent' ? '↑ Sent' : msg.type === 'received' ? '↓ Received' : '● System'}
                  </Text>
                  <Text style={styles.messageTime}>{formatTime(msg.timestamp)}</Text>
                </View>
                <Text style={styles.messageData}>{msg.data}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Connect and send a message to see it here</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    padding: 16,
  },
  infoBox: {
    backgroundColor: '#1e3a5f',
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  infoText: {
    color: '#93c5fd',
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  urlInput: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f9fafb',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2d2d44',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  connectButton: {
    backgroundColor: '#10b981',
  },
  disconnectButton: {
    backgroundColor: '#ef4444',
  },
  jsonButton: {
    backgroundColor: '#8b5cf6',
    marginTop: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f9fafb',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  sendButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  messagesSection: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2d44',
    overflow: 'hidden',
  },
  messagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  clearText: {
    color: '#818cf8',
    fontSize: 14,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 12,
    gap: 8,
  },
  messageItem: {
    padding: 12,
    borderRadius: 8,
  },
  messageSent: {
    backgroundColor: '#1e3a5f',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  messageReceived: {
    backgroundColor: '#1a3a2e',
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  messageSystem: {
    backgroundColor: '#2d2d44',
    borderLeftWidth: 3,
    borderLeftColor: '#6b7280',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  messageType: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  messageTime: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  messageData: {
    color: '#f9fafb',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 4,
  },
  emptySubtext: {
    color: '#4b5563',
    fontSize: 12,
  },
});
