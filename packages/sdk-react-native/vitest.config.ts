import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stub = (name: string) => fileURLToPath(new URL(`./test/stubs/${name}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@frontmail/sdk-core': fileURLToPath(new URL('../sdk-core/src/index.ts', import.meta.url)),
      // The real packages ship Flow / native code; tests run against small DOM-backed stubs.
      'react-native': stub('react-native.tsx'),
    },
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});
