/**
 * Optional peer dependencies, loaded lazily (see optional-modules.js for why the `require()` calls
 * live in a separate, unbundled file). Nothing is evaluated until a feature needs it. Exposed as a
 * mutable object so tests (and exotic setups) can swap the loaders.
 */
import type { ComponentType } from 'react';
import { requireAsyncStorage, requireWebView } from './optional-modules.js';

/** Minimal shape of `@react-native-async-storage/async-storage` used by the SDK. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null | undefined>;
  setItem(key: string, value: string): Promise<void>;
}

/** Minimal shape of the `react-native-webview` module used by `<TurnstileWebView>`. */
export interface WebViewModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WebView: ComponentType<any>;
}

const interop = <T>(m: unknown): T => ((m as { default?: T })?.default ?? m) as T;

export const optional = {
  asyncStorage(): AsyncStorageLike | null {
    const m = interop<AsyncStorageLike | null>(requireAsyncStorage());
    return m && typeof m.getItem == 'function' ? m : null;
  },
  webView(): WebViewModule | null {
    const m = requireWebView() as (Partial<WebViewModule> & { default?: WebViewModule['WebView'] }) | null;
    const WebView = m?.WebView ?? m?.default;
    return WebView ? { WebView } : null;
  },
};

declare const __DEV__: boolean | undefined;

/** `console.warn` in development builds only (`__DEV__` is defined by Metro). */
export function devWarn(message: string): void {
  if (typeof __DEV__ != 'undefined' && __DEV__) console.warn('[frontmail] ' + message);
}
