import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Inline types from the private (unpublished) shared package so consumers'
  // type checking does not hit an unresolvable '@android-debugger/shared' import.
  dts: { resolve: ['@android-debugger/shared'] },
  clean: true,
  sourcemap: true,
  external: ['react', 'react-native'],
  noExternal: ['@android-debugger/shared'],
  // Sent to the desktop app in the connection handshake.
  define: { __SDK_VERSION__: JSON.stringify(version) },
});
