import { FrontmailError } from '@frontmail/sdk-core';
import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { devWarn, optional } from './optional';

export const TURNSTILE_MESSAGE_SOURCE = 'frontmail-turnstile';

export interface TurnstileWebViewProps {
  /** Cloudflare Turnstile site key. */
  siteKey: string;
  /**
   * Page URL the widget pretends to run on, e.g. `https://example.com`. Its hostname must be listed
   * in the site key's allowed hostnames in the Cloudflare dashboard, otherwise Turnstile fails with
   * error 110200.
   */
  baseUrl: string;
  /** Called with a fresh token (single use – pass it to `send(params, { turnstileToken })`). */
  onToken: (token: string) => void;
  onError?: (error: FrontmailError) => void;
  /** The token expired (~300 s) – the widget refreshes itself; clear any stored token. */
  onExpire?: () => void;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'compact' | 'flexible';
  /** Turnstile `action` (analytics label), `[a-z0-9_-]{0,32}`. */
  action?: string;
  /** Widget language, e.g. `cs`. Default `auto`. */
  language?: string;
  /** Style of the WebView. Default: 300 × 70 for `normal`, 150 × 140 for `compact`. */
  style?: StyleProp<ViewStyle>;
  /** Extra props for the underlying WebView. */
  webViewProps?: Record<string, unknown>;
  /** WebView component to use instead of `react-native-webview`'s (custom forks, tests). */
  WebViewComponent?: ComponentType<Record<string, unknown>>;
}

export interface TurnstileWebViewHandle {
  /** Resets the widget and requests a new token (tokens are single use). */
  reset(): void;
}

interface WebViewRef {
  injectJavaScript?(script: string): void;
}

/** JSON for inline `<script>`: `<`, U+2028/9 escaped so values can't close the script tag. */
const js = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** HTML page that renders the widget and posts `{ source, type, token | code }` to React Native. */
export function turnstileHtml(o: Pick<TurnstileWebViewProps, 'siteKey' | 'theme' | 'size' | 'action' | 'language'>): string {
  const options = {
    sitekey: o.siteKey,
    theme: o.theme ?? 'auto',
    size: o.size ?? 'normal',
    language: o.language ?? 'auto',
    ...(o.action ? { action: o.action } : {}),
  };
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent}#w{display:flex;justify-content:center}</style>
<script>
function fmPost(m){m.source=${js(TURNSTILE_MESSAGE_SOURCE)};window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function fmRender(){var o=${js(options)};
o.callback=function(t){fmPost({type:'token',token:t});};
o['error-callback']=function(c){fmPost({type:'error',code:String(c==null?'':c)});return true;};
o['expired-callback']=function(){fmPost({type:'expired'});};
window.fmWidget=turnstile.render('#w',o);}
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=fmRender" async defer onerror="fmPost({type:'error',code:'script_load_failed'})"></script>
</head><body><div id="w"></div></body></html>`;
}

const SIZES = { normal: { width: 300, height: 70 }, flexible: { width: '100%', height: 70 }, compact: { width: 150, height: 140 } } as const;

/**
 * Cloudflare Turnstile for React Native: renders the widget inside `react-native-webview` (optional
 * peer dependency, loaded lazily) with `baseUrl` as the page URL, and reports the token via `onToken`.
 */
export const TurnstileWebView = forwardRef<TurnstileWebViewHandle, TurnstileWebViewProps>(function TurnstileWebView(
  { siteKey, baseUrl, onToken, onError, onExpire, theme, size, action, language, style, webViewProps, WebViewComponent },
  ref,
) {
  const webView = useRef<WebViewRef | null>(null);
  const callbacks = useRef({ onToken, onError, onExpire });
  callbacks.current = { onToken, onError, onExpire };
  const Component = useMemo(() => WebViewComponent ?? optional.webView()?.WebView ?? null, [WebViewComponent]);
  const html = useMemo(() => turnstileHtml({ siteKey, theme, size, action, language }), [siteKey, theme, size, action, language]);

  useEffect(() => {
    if (Component) return;
    const message = '<TurnstileWebView> needs react-native-webview – install it (npx expo install react-native-webview).';
    devWarn(message);
    callbacks.current.onError?.(new FrontmailError('captcha_failed', message));
  }, [Component]);

  useImperativeHandle(ref, () => ({
    reset() {
      webView.current?.injectJavaScript?.('window.turnstile&&window.turnstile.reset(window.fmWidget);true;');
    },
  }));

  if (!Component) return null;

  const onMessage = (event: { nativeEvent?: { data?: string } }) => {
    let m: { source?: string; type?: string; token?: string; code?: string };
    try {
      m = JSON.parse(event.nativeEvent?.data ?? '');
    } catch {
      return;
    }
    if (!m || m.source !== TURNSTILE_MESSAGE_SOURCE) return;
    const cb = callbacks.current;
    if (m.type == 'token' && m.token) cb.onToken(m.token);
    else if (m.type == 'expired') cb.onExpire?.();
    else if (m.type == 'error') cb.onError?.(new FrontmailError('captcha_failed', 'Turnstile error ' + (m.code ?? ''), { details: { code: m.code } }));
  };
  const onLoadError = () => callbacks.current.onError?.(new FrontmailError('captcha_failed', 'The Turnstile WebView failed to load.'));

  return createElement(Component, {
    ref: webView,
    source: { html, baseUrl },
    originWhitelist: ['*'],
    javaScriptEnabled: true,
    domStorageEnabled: true,
    scrollEnabled: false,
    automaticallyAdjustContentInsets: false,
    style: [{ backgroundColor: 'transparent' }, SIZES[size ?? 'normal'], style],
    ...webViewProps,
    onMessage,
    onError: onLoadError,
  });
});
