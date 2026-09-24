import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  resolve: { alias: { '@frontmail/sdk-core': fileURLToPath(new URL('../sdk-core/src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
});
