import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: [
    'react',
    'react-native',
    'expo',
    'expo-modules-core',
    '@yemirhan/android-debugger-sdk',
  ],
});
