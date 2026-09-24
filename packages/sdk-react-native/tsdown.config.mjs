// @ts-check
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  deps: {
    // Peers are resolved by Metro in the app. optional-modules.js holds the guarded `require()`s of
    // the optional peers and must reach Metro untouched, so it is copied instead of bundled.
    neverBundle: ['react', 'react-native', 'react-native-webview', '@react-native-async-storage/async-storage', /optional-modules\.js$/],
  },
  copy: [{ from: 'src/optional-modules.js', to: 'dist' }],
});
