import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useCounterStore, useTodoStore } from '@/store/zustand';

export default function ZustandScreen() {
  const [todoText, setTodoText] = useState('');

  // Counter store
  const count = useCounterStore((state) => state.count);
  const increment = useCounterStore((state) => state.increment);
  const decrement = useCounterStore((state) => state.decrement);
  const reset = useCounterStore((state) => state.reset);
  const incrementBy = useCounterStore((state) => state.incrementBy);

  // Todo store
  const todos = useTodoStore((state) => state.todos);
  const addTodo = useTodoStore((state) => state.addTodo);
  const toggleTodo = useTodoStore((state) => state.toggleTodo);
  const removeTodo = useTodoStore((state) => state.removeTodo);
  const clearCompleted = useTodoStore((state) => state.clearCompleted);

  const handleAddTodo = () => {
    if (todoText.trim()) {
      addTodo(todoText.trim());
      setTodoText('');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Zustand store changes are automatically tracked and sent to the desktop app.
          Watch the SDK panel to see state updates in real-time!
        </Text>
      </View>

      {/* Counter Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Counter Store</Text>
        <Text style={styles.sectionDescription}>
          Simple counter to demonstrate state tracking
        </Text>

        <View style={styles.counterDisplay}>
          <Text style={styles.counterValue}>{count}</Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={decrement}>
            <Text style={styles.buttonText}>-1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={increment}>
            <Text style={styles.buttonText}>+1</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={() => incrementBy(5)}>
            <Text style={styles.buttonText}>+5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => incrementBy(10)}>
            <Text style={styles.buttonText}>+10</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={reset}>
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Todo Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Todo Store</Text>
        <Text style={styles.sectionDescription}>
          Add, toggle, and remove todos to see state changes
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={todoText}
            onChangeText={setTodoText}
            placeholder="Enter todo..."
            placeholderTextColor="#6b7280"
            onSubmitEditing={handleAddTodo}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddTodo}>
            <Text style={styles.buttonText}>Add</Text>
          </TouchableOpacity>
        </View>

        {todos.length > 0 ? (
          <View style={styles.todoList}>
            {todos.map((todo) => (
              <View key={todo.id} style={styles.todoItem}>
                <TouchableOpacity
                  style={styles.todoCheckbox}
                  onPress={() => toggleTodo(todo.id)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      todo.completed && styles.checkboxChecked,
                    ]}
                  >
                    {todo.completed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
                <Text
                  style={[
                    styles.todoText,
                    todo.completed && styles.todoTextCompleted,
                  ]}
                >
                  {todo.text}
                </Text>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => removeTodo(todo.id)}
                >
                  <Text style={styles.deleteText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}

            {todos.some((t) => t.completed) && (
              <TouchableOpacity
                style={[styles.button, styles.clearButton]}
                onPress={clearCompleted}
              >
                <Text style={styles.buttonText}>Clear Completed</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No todos yet</Text>
          </View>
        )}
      </View>
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
  infoBox: {
    backgroundColor: '#1e3a5f',
    padding: 14,
    borderRadius: 8,
    marginBottom: 20,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#f9fafb',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 16,
  },
  counterDisplay: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    marginBottom: 16,
  },
  counterValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#818cf8',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  button: {
    flex: 1,
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#6b7280',
  },
  clearButton: {
    backgroundColor: '#dc2626',
    marginTop: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  input: {
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
  addButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  todoList: {
    gap: 8,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  todoCheckbox: {
    padding: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4f46e5',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  todoText: {
    flex: 1,
    color: '#f9fafb',
    fontSize: 14,
  },
  todoTextCompleted: {
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  deleteButton: {
    padding: 4,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 24,
    fontWeight: '300',
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },
});
