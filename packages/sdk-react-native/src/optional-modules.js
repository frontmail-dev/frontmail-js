// Hand-written and copied to dist/ verbatim (not bundled): Metro only treats a dependency as
// optional when a literal `require('<name>')` sits directly inside a `try` block, and bundlers
// rewrite `require` in ESM. Apps without these packages still bundle (Expo enables
// `allowOptionalDependencies`); outside Metro `require` is undefined and both return null.
/* eslint-disable @typescript-eslint/no-require-imports */

export function requireAsyncStorage() {
  try {
    return require('@react-native-async-storage/async-storage');
  } catch {
    return null;
  }
}

export function requireWebView() {
  try {
    return require('react-native-webview');
  } catch {
    return null;
  }
}
