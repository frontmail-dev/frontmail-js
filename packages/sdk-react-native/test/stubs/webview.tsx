// Stand-in for react-native-webview's <WebView>: records its props and exposes injectJavaScript.
import { createElement, forwardRef, useImperativeHandle } from 'react';

export interface WebViewCall {
  props: Record<string, unknown>;
  injected: string[];
}

export function createWebViewStub() {
  const state: { last?: WebViewCall; renders: number } = { renders: 0 };
  const WebView = forwardRef<{ injectJavaScript(s: string): void }, Record<string, unknown>>(function WebView(props, ref) {
    const call: WebViewCall = { props, injected: state.last?.injected ?? [] };
    state.last = call;
    state.renders++;
    useImperativeHandle(ref, () => ({ injectJavaScript: (s: string) => void call.injected.push(s) }));
    return createElement('div', { 'data-testid': 'webview' });
  });
  /** Simulates `window.ReactNativeWebView.postMessage(data)` from inside the page. */
  const post = (data: unknown) =>
    (state.last!.props.onMessage as (e: { nativeEvent: { data: string } }) => void)({
      nativeEvent: { data: typeof data == 'string' ? data : JSON.stringify(data) },
    });
  return { WebView, state, post };
}
