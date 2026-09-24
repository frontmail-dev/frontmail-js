// @ts-check
import { defineConfig } from 'tsdown';

const shared = {
  platform: 'browser',
  target: 'es2022',
  // sdk-core is inlined so the browser bundle is self-contained and tree-shaken.
  deps: { alwaysBundle: ['@frontmail/sdk-core'], onlyBundle: false },
};

export default defineConfig([
  { ...shared, entry: { index: 'src/index.ts' }, format: 'esm', dts: true, sourcemap: true },
  {
    ...shared,
    entry: { 'frontmail.umd': 'src/umd.ts' },
    format: 'umd',
    globalName: 'frontmail',
    minify: true,
    dts: false,
    clean: false,
    outputOptions: { exports: 'default', entryFileNames: '[name].js' },
  },
]);
