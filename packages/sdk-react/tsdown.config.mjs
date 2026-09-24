// @ts-check
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  // Mark the entry as a client module for React Server Components frameworks.
  banner: { js: "'use client';" },
});
