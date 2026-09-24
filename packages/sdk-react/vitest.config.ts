import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@frontmail/sdk-core': fileURLToPath(new URL('../sdk-core/src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});
