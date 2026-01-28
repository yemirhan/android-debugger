import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TextInput } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { ActionButton, ResultDisplay, ConnectionStatus } from '@/components';
import {
  RootState,
  increment,
  decrement,
  incrementByAmount,
  reset,
  login,
  logout,
  addTodo,
  toggleTodo,
  clearCompleted,
} from '@/store/redux';

export default function ReduxScreen() {
  const dispatch = useDispatch();
  const counter = useSelector((state: RootState) => state.counter);
  const user = useSelector((state: RootState) => state.user);
  const todos = useSelector((state: RootState) => state.todos);

  const [results, setResults] = useState<string[]>([]);
  const [todoText, setTodoText] = useState('');

  const addResult = (message: string) => {
    setResults((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Counter actions
  const handleIncrement = () => {
    dispatch(increment());
    addResult('Dispatched: counter/increment');
  };

  const handleDecrement = () => {
    dispatch(decrement());
    addResult('Dispatched: counter/decrement');
  };

  const handleIncrementBy5 = () => {
    dispatch(incrementByAmount(5));
    addResult('Dispatched: counter/incrementByAmount(5)');
  };

  const handleReset = () => {
    dispatch(reset());
    addResult('Dispatched: counter/reset');
  };

  // User actions
  const handleLogin = () => {
    dispatch(login({ name: 'John Doe', email: 'john@example.com' }));
    addResult('Dispatched: user/login');
  };

  const handleLogout = () => {
    dispatch(logout());
    addResult('Dispatched: user/logout');
  };

  // Todo actions
  const handleAddTodo = () => {
    if (todoText.trim()) {
      dispatch(addTodo(todoText.trim()));
      addResult(`Dispatched: todos/addTodo("${todoText.trim()}")`);
      setTodoText('');
    }
  };

  const handleToggleTodo = (id: number) => {
    dispatch(toggleTodo(id));
    addResult(`Dispatched: todos/toggleTodo(${id})`);
  };

  const handleClearCompleted = () => {
    dispatch(clearCompleted());
    addResult('Dispatched: todos/clearCompleted');
  };

  const clearResults = () => setResults([]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ConnectionStatus />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Counter Slice</Text>
        <Text style={styles.sectionDescription}>
          Redux actions are tracked via createReduxMiddleware().
        </Text>

        <View style={styles.stateDisplay}>
          <Text style={styles.stateValue}>{counter.value}</Text>
          <Text style={styles.stateLabel}>Last: {counter.lastAction || 'none'}</Text>
        </View>

        <View style={styles.buttonRow}>
          <View style={styles.buttonHalf}>
            <ActionButton title="-" onPress={handleDecrement} variant="secondary" />
          </View>
          <View style={styles.buttonHalf}>
            <ActionButton title="+" onPress={handleIncrement} />
          </View>
        </View>

        <ActionButton title="+5" onPress={handleIncrementBy5} icon="add" variant="secondary" />
        <ActionButton title="Reset" onPress={handleReset} icon="refresh" variant="danger" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User Slice</Text>

        <View style={styles.stateDisplay}>
          <Text style={styles.stateLabel}>
            Status: {user.isLoggedIn ? 'Logged In' : 'Logged Out'}
          </Text>
          {user.isLoggedIn && (
            <>
              <Text style={styles.stateLabel}>Name: {user.name}</Text>
              <Text style={styles.stateLabel}>Email: {user.email}</Text>
            </>
          )}
        </View>

        {user.isLoggedIn ? (
          <ActionButton title="Logout" onPress={handleLogout} icon="log-out" variant="danger" />
        ) : (
          <ActionButton title="Login" onPress={handleLogin} icon="log-in" />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Todos Slice</Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={todoText}
            onChangeText={setTodoText}
            placeholder="Add a todo..."
            placeholderTextColor="#6b7280"
          />
          <View style={styles.addButton}>
            <ActionButton title="Add" onPress={handleAddTodo} />
          </View>
        </View>

        <View style={styles.todoList}>
          {todos.items.length === 0 ? (
            <Text style={styles.emptyText}>No todos yet</Text>
          ) : (
            todos.items.map((todo) => (
              <View key={todo.id} style={styles.todoItem}>
                <ActionButton
                  title={todo.completed ? '✓' : '○'}
                  onPress={() => handleToggleTodo(todo.id)}
                  variant={todo.completed ? 'primary' : 'secondary'}
                />
                <Text
                  style={[styles.todoText, todo.completed && styles.todoCompleted]}
                >
                  {todo.text}
                </Text>
              </View>
            ))
          )}
        </View>

        {todos.items.some((t) => t.completed) && (
          <ActionButton
            title="Clear Completed"
            onPress={handleClearCompleted}
            icon="trash"
            variant="secondary"
          />
        )}
      </View>

      <ResultDisplay title="Action History" results={results} />

      {results.length > 0 && (
        <ActionButton title="Clear History" onPress={clearResults} variant="secondary" icon="trash" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 16,
    lineHeight: 20,
  },
  stateDisplay: {
    backgroundColor: '#1f2937',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  stateValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#6366f1',
    fontFamily: 'monospace',
  },
  stateLabel: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonHalf: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f9fafb',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#374151',
  },
  addButton: {
    width: 70,
  },
  todoList: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  todoText: {
    fontSize: 15,
    color: '#f9fafb',
    marginLeft: 8,
    flex: 1,
  },
  todoCompleted: {
    textDecorationLine: 'line-through',
    color: '#6b7280',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
