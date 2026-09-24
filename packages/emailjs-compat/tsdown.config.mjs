// @ts-check
import { defineConfig } from 'tsdown';

const shared = {
  platform: 'browser',
  target: 'es2022',
  deps: { alwaysBundle: ['@frontmail/sdk-core'], onlyBundle: false },
};

export default defineConfig([
  { ...shared, entry: { index: 'src/index.ts' }, format: 'esm', dts: true, sourcemap: true },
  {
    ...shared,
    entry: { 'emailjs-compat.umd': 'src/index.ts' },
    format: 'umd',
    // Same global as the EmailJS CDN build.
    globalName: 'emailjs',
    minify: true,
    dts: false,
    clean: false,
    outputOptions: { exports: 'named', entryFileNames: '[name].js' },
  },
]);
