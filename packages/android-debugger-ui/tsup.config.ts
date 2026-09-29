import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Inline types from the private (unpublished) shared package so consumers'
  // type checking does not hit an unresolvable '@android-debugger/shared' import.
  dts: { resolve: ['@android-debugger/shared'] },
  clean: true,
  sourcemap: true,
  external: ['react', 'react-native', '@expo/vector-icons', 'expo-router', '@yemirhan/android-debugger-sdk'],
  noExternal: ['@android-debugger/shared'],
});
