// @ts-check
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/bin.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  outputOptions: (o, _format, _ctx) => ({
    ...o,
    banner: (chunk) => (chunk.name === 'cli' ? '#!/usr/bin/env node' : ''),
  }),
});
