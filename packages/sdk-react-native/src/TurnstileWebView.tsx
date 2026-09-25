import { FrontmailError, getPublicConfig, isFrontmailError } from '@frontmail/sdk-core';
import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Linking } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useOptionalFrontmail } from './context';
import { devWarn, optional } from './optional';
import { markOrgTurnstileToken } from './turnstile-key';

export const TURNSTILE_MESSAGE_SOURCE = 'frontmail-turnstile';

export interface TurnstileWebViewProps {
  /**
   * Your own Cloudflare Turnstile site key. Optional: by default the widget uses Frontmail's shared
   * mobile key (read once from `GET <apiUrl>/v1/public-config` and cached). Tokens from your own key
   * are sent with `turnstileKey: 'org'` automatically, so the API verifies them with the secret
   * configured in the dashboard (Security → Bot protection).
   */
  siteKey?: string;
  /**
   * Page URL the widget pretends to run on (the page is inline HTML – no DNS or hosting needed).
   * With the shared key it defaults to Frontmail's mobile hostname (`https://mobile.frontmail.dev`).
   * Required with your own `siteKey`: its hostname must be one of YOUR widget's allowed hostnames in
   * the Cloudflare dashboard (e.g. `https://example.com`), otherwise Turnstile fails with 110200.
   */
  baseUrl?: string;
  /**
   * API URL used to load the shared key when `siteKey` is omitted. Defaults to the `apiUrl` of the
   * surrounding `<FrontmailProvider>`, then `https://api.frontmail.dev`.
   */
  apiUrl?: string;
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
  /**
   * Extra props for the underlying WebView (styling, testID, …). `source`, `originWhitelist`,
   * navigation guards, `onMessage` and the JavaScript/file-access settings are always set by
   * the component and cannot be overridden.
   */
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
export function turnstileHtml(
  o: { siteKey: string } & Pick<TurnstileWebViewProps, 'theme' | 'size' | 'action' | 'language'>,
): string {
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

/** Origin of the Turnstile widget iframe and script. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** `scheme://host[:port]` of an absolute URL, lower-cased (no `URL`: React Native's is incomplete). */
export function originOf(url: string | undefined): string | undefined {
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#\\]*)/i.exec(url ?? '');
  return m ? m[1]!.toLowerCase() : undefined;
}

const MESSAGE_TYPES = new Set(['token', 'expired', 'error']);
const MAX_TOKEN_LENGTH = 4096;

interface TurnstileMessage {
  type: 'token' | 'expired' | 'error';
  token?: string;
  code?: string;
}

/** Parses a bridge message; `null` unless it has exactly the shape the inline page posts. */
export function parseTurnstileMessage(data: unknown): TurnstileMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(typeof data == 'string' ? data : '');
  } catch {
    return null;
  }
  if (!m || typeof m != 'object' || Array.isArray(m)) return null;
  const { source, type, token, code } = m as Record<string, unknown>;
  if (source !== TURNSTILE_MESSAGE_SOURCE || typeof type != 'string' || !MESSAGE_TYPES.has(type)) return null;
  if (type == 'token' && (typeof token != 'string' || !token || token.length > MAX_TOKEN_LENGTH)) return null;
  if (code !== undefined && (typeof code != 'string' || code.length > 64)) return null;
  return { type: type as TurnstileMessage['type'], token: token as string | undefined, code: code as string | undefined };
}

interface NavigationRequest {
  url?: string;
  /** iOS only; `false` for iframes (the Turnstile challenge runs in one). */
  isTopFrame?: boolean;
}

/**
 * Navigation guard: the top frame must stay on the inline page (`baseUrl`); links clicked inside
 * the widget (Cloudflare privacy / terms / help) open in the system browser instead of turning the
 * WebView – which holds the `postMessage` bridge – into a general-purpose browser.
 */
export function shouldStartLoad(request: NavigationRequest, baseUrl: string, openUrl: (url: string) => void = openExternal): boolean {
  const url = request.url ?? '';
  if (request.isTopFrame === false) return true;
  if (url == 'about:blank' || url.startsWith('about:srcdoc')) return true;
  const origin = originOf(url);
  // The challenge iframe (Android does not report `isTopFrame`).
  if (origin && (origin == originOf(baseUrl) || origin == TURNSTILE_ORIGIN)) return true;
  if (/^https:\/\//i.test(url)) openUrl(url);
  return false;
}

function openExternal(url: string): void {
  Promise.resolve()
    .then(() => Linking?.openURL?.(url))
    .catch(() => {});
}

const SIZES = { normal: { width: 300, height: 70 }, flexible: { width: '100%', height: 70 }, compact: { width: 150, height: 140 } } as const;

interface Widget {
  siteKey: string;
  baseUrl: string;
}

/**
 * Cloudflare Turnstile for React Native: renders the widget inside `react-native-webview` (optional
 * peer dependency, loaded lazily) with `baseUrl` as the page URL, and reports the token via `onToken`.
 * Without `siteKey` it uses Frontmail's shared mobile key and renders nothing until that is loaded.
 */
export const TurnstileWebView = forwardRef<TurnstileWebViewHandle, TurnstileWebViewProps>(function TurnstileWebView(
  { siteKey, baseUrl, apiUrl, onToken, onError, onExpire, theme, size, action, language, style, webViewProps, WebViewComponent },
  ref,
) {
  const webView = useRef<WebViewRef | null>(null);
  const callbacks = useRef({ onToken, onError, onExpire });
  callbacks.current = { onToken, onError, onExpire };
  const Component = useMemo(() => WebViewComponent ?? optional.webView()?.WebView ?? null, [WebViewComponent]);
  const client = useOptionalFrontmail();
  const configUrl = apiUrl ?? client?.options.apiUrl;
  const configFetch = client?.options.fetch;
  const [shared, setShared] = useState<Widget | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failed = useRef(false);

  useEffect(() => {
    if (siteKey || !Component) return;
    let active = true;
    failed.current = false;
    setShared(null);
    getPublicConfig(configUrl, configFetch).then(
      ({ turnstile: t }) => {
        if (!active) return;
        if (t.mobileSiteKey && (baseUrl || t.mobileBaseUrl)) setShared({ siteKey: t.mobileSiteKey, baseUrl: baseUrl || t.mobileBaseUrl! });
        else {
          failed.current = true;
          callbacks.current.onError?.(
            new FrontmailError('captcha_failed', "This API has no shared mobile Turnstile key – pass your own siteKey and baseUrl.", {
              details: { reason: 'not_configured' },
            }),
          );
        }
      },
      (e: unknown) => {
        if (!active) return;
        failed.current = true;
        callbacks.current.onError?.(
          isFrontmailError(e) ? e : new FrontmailError('network_error', 'Failed to load the Turnstile configuration.', { cause: e }),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [siteKey, baseUrl, configUrl, configFetch, Component, attempt]);

  const widget: Widget | null = siteKey ? (baseUrl ? { siteKey, baseUrl } : null) : shared;
  const widgetKey = widget?.siteKey;
  const html = useMemo(
    () => (widgetKey ? turnstileHtml({ siteKey: widgetKey, theme, size, action, language }) : ''),
    [widgetKey, theme, size, action, language],
  );

  useEffect(() => {
    if (!siteKey || baseUrl) return;
    const message = '<TurnstileWebView> needs baseUrl (one of your widget\'s hostnames) when you pass your own siteKey.';
    devWarn(message);
    callbacks.current.onError?.(new FrontmailError('captcha_failed', message, { details: { reason: 'missing_base_url' } }));
  }, [siteKey, baseUrl]);

  useEffect(() => {
    if (Component) return;
    const message = '<TurnstileWebView> needs react-native-webview – install it (npx expo install react-native-webview).';
    devWarn(message);
    callbacks.current.onError?.(new FrontmailError('captcha_failed', message));
  }, [Component]);

  useImperativeHandle(ref, () => ({
    reset() {
      // A failed shared-key lookup is retried; otherwise the widget itself is reset.
      if (failed.current) setAttempt((a) => a + 1);
      else webView.current?.injectJavaScript?.('window.turnstile&&window.turnstile.reset(window.fmWidget);true;');
    },
  }));

  if (!Component || !widget) return null;
  const custom = !!siteKey;

  const pageOrigin = originOf(widget.baseUrl);
  const onMessage = (event: { nativeEvent?: { data?: string; url?: string } }) => {
    // Only the inline page (served as `baseUrl`) may talk to the app.
    const from = event.nativeEvent?.url;
    if (from !== undefined && originOf(from) !== pageOrigin) return;
    const m = parseTurnstileMessage(event.nativeEvent?.data);
    if (!m) return;
    const cb = callbacks.current;
    if (m.type == 'token' && m.token) {
      if (custom) markOrgTurnstileToken(m.token);
      cb.onToken(m.token);
    }
    else if (m.type == 'expired') cb.onExpire?.();
    else if (m.type == 'error') cb.onError?.(new FrontmailError('captcha_failed', 'Turnstile error ' + (m.code ?? ''), { details: { code: m.code } }));
  };
  const onLoadError = () => callbacks.current.onError?.(new FrontmailError('captcha_failed', 'The Turnstile WebView failed to load.'));

  return createElement(Component, {
    scrollEnabled: false,
    automaticallyAdjustContentInsets: false,
    style: [{ backgroundColor: 'transparent' }, SIZES[size ?? 'normal'], style],
    ...webViewProps,
    // Security-relevant props come last so `webViewProps` cannot override them.
    ref: webView,
    source: { html, baseUrl: widget.baseUrl },
    originWhitelist: [pageOrigin ?? widget.baseUrl, TURNSTILE_ORIGIN, 'about:blank', 'about:srcdoc'],
    onShouldStartLoadWithRequest: (request: NavigationRequest) => shouldStartLoad(request, widget.baseUrl),
    javaScriptEnabled: true,
    domStorageEnabled: true,
    javaScriptCanOpenWindowsAutomatically: false,
    allowFileAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
    mixedContentMode: 'never',
    onMessage,
    onError: onLoadError,
  });
});
