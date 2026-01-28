import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AndroidDebugger } from '@yemirhan/android-debugger-sdk';

// Counter slice
const counterSlice = createSlice({
  name: 'counter',
  initialState: {
    value: 0,
    lastAction: null as string | null,
  },
  reducers: {
    increment: (state) => {
      state.value += 1;
      state.lastAction = 'increment';
    },
    decrement: (state) => {
      state.value -= 1;
      state.lastAction = 'decrement';
    },
    incrementByAmount: (state, action: PayloadAction<number>) => {
      state.value += action.payload;
      state.lastAction = `incrementByAmount(${action.payload})`;
    },
    reset: (state) => {
      state.value = 0;
      state.lastAction = 'reset';
    },
  },
});

// User slice
const userSlice = createSlice({
  name: 'user',
  initialState: {
    name: null as string | null,
    email: null as string | null,
    isLoggedIn: false,
  },
  reducers: {
    login: (state, action: PayloadAction<{ name: string; email: string }>) => {
      state.name = action.payload.name;
      state.email = action.payload.email;
      state.isLoggedIn = true;
    },
    logout: (state) => {
      state.name = null;
      state.email = null;
      state.isLoggedIn = false;
    },
    updateProfile: (state, action: PayloadAction<{ name?: string; email?: string }>) => {
      if (action.payload.name) state.name = action.payload.name;
      if (action.payload.email) state.email = action.payload.email;
    },
  },
});

// Todos slice
const todosSlice = createSlice({
  name: 'todos',
  initialState: {
    items: [] as { id: number; text: string; completed: boolean }[],
    nextId: 1,
  },
  reducers: {
    addTodo: (state, action: PayloadAction<string>) => {
      state.items.push({
        id: state.nextId,
        text: action.payload,
        completed: false,
      });
      state.nextId += 1;
    },
    toggleTodo: (state, action: PayloadAction<number>) => {
      const todo = state.items.find((t) => t.id === action.payload);
      if (todo) {
        todo.completed = !todo.completed;
      }
    },
    removeTodo: (state, action: PayloadAction<number>) => {
      state.items = state.items.filter((t) => t.id !== action.payload);
    },
    clearCompleted: (state) => {
      state.items = state.items.filter((t) => !t.completed);
    },
  },
});

export const { increment, decrement, incrementByAmount, reset } = counterSlice.actions;
export const { login, logout, updateProfile } = userSlice.actions;
export const { addTodo, toggleTodo, removeTodo, clearCompleted } = todosSlice.actions;

// Create store with debugger middleware
export const createStore = () => {
  return configureStore({
    reducer: {
      counter: counterSlice.reducer,
      user: userSlice.reducer,
      todos: todosSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(AndroidDebugger.createReduxMiddleware()),
  });
};

export type RootState = ReturnType<ReturnType<typeof createStore>['getState']>;
export type AppDispatch = ReturnType<typeof createStore>['dispatch'];
