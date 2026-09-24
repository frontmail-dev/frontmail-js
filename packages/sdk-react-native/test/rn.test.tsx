import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_NAME,
  FrontmailProvider,
  TurnstileWebView,
  asyncStorageProvider,
  defaultStorageProvider,
  memoryStorageProvider,
  turnstileHtml,
  useFrontmail,
  useSendEmail,
  uuid,
} from '../src';
import type { FrontmailError, FrontmailOptions, SendResult, TurnstileWebViewHandle } from '../src';
import { optional } from '../src/optional';
import { accepted, apiError, jsonResponse } from './helpers';
import { createWebViewStub } from './stubs/webview';

const loaders = { ...optional };
afterEach(() => {
  cleanup();
  Object.assign(optional, loaders);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function deferredFetch() {
  let resolve: ((r: Response) => void) | undefined;
  const calls: { url: string; init: RequestInit & { headers: Record<string, string> } }[] = [];
  const fetch = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init: init as never });
    return new Promise<Response>((r) => (resolve = r));
  }) as unknown as typeof globalThis.fetch;
  const respond = async (r: Response) => {
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    await act(async () => resolve!(r));
    resolve = undefined;
  };
  return { fetch, calls, respond };
}

const wrapper = (options: FrontmailOptions) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <FrontmailProvider options={options}>{children}</FrontmailProvider>;
  };

describe('FrontmailProvider / useFrontmail', () => {
  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useFrontmail())).toThrow(/FrontmailProvider/);
  });

  it('identifies itself as @frontmail/react-native/<version>', () => {
    const { result } = renderHook(() => useFrontmail(), { wrapper: wrapper({ publicKey: 'pk' }) });
    expect(CLIENT_NAME).toMatch(/^@frontmail\/react-native\/\d+\.\d+\.\d+/);
    expect(result.current.options.clientName).toBe(CLIENT_NAME);
    expect(result.current.options.storageProvider).toBeDefined();
  });
});

describe('useSendEmail', () => {
  it.each([
    ['queued', 'sent'],
    ['held', 'held'],
  ] as const)('idle → sending → %s maps to %s and sends the RN client header', async (apiStatus, expected) => {
    const f = deferredFetch();
    const { result } = renderHook(() => useSendEmail('svc', 'tpl'), { wrapper: wrapper({ publicKey: 'pk', fetch: f.fetch }) });
    expect(result.current.status).toBe('idle');
    let p!: Promise<SendResult | undefined>;
    act(() => {
      p = result.current.send({ name: 'Jan' });
    });
    expect(result.current.status).toBe('sending');
    await f.respond(accepted(apiStatus));
    await act(async () => void (await p));
    expect(result.current.status).toBe(expected);
    expect(result.current.result?.messageId).toBe('msg_1');
    expect(f.calls[0]!.init.headers['X-Frontmail-Client']).toBe(CLIENT_NAME);
    expect(f.calls[0]!.init.headers['X-Frontmail-Public-Key']).toBe('pk');
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
  });

  it('idle → sending → error with a typed error (never rejects)', async () => {
    const f = deferredFetch();
    const { result } = renderHook(() => useSendEmail('svc', 'tpl'), {
      wrapper: wrapper({ publicKey: 'pk', fetch: f.fetch, retry: false }),
    });
    let p!: Promise<SendResult | undefined>;
    act(() => {
      p = result.current.send({});
    });
    await f.respond(apiError(403, 'origin_not_allowed'));
    await act(async () => void (await p));
    await expect(p).resolves.toBeUndefined();
    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('origin_not_allowed');
    expect(result.current.error?.status).toBe(403);
  });

  it('passes the Turnstile token and reuses the idempotency key across retries', async () => {
    const f = deferredFetch();
    const { result } = renderHook(() => useSendEmail(null, 'tpl'), {
      wrapper: wrapper({ publicKey: 'pk', fetch: f.fetch, retry: { retries: 1, baseDelayMs: 1, maxDelayMs: 1 } }),
    });
    let p!: Promise<SendResult | undefined>;
    act(() => {
      p = result.current.send({ email: 'a@b.cz' }, { turnstileToken: 'ts-token' });
    });
    await f.respond(apiError(503, 'service_unavailable'));
    await f.respond(accepted());
    await act(async () => void (await p));
    expect(result.current.status).toBe('sent');
    expect(f.calls).toHaveLength(2);
    for (const c of f.calls) expect(JSON.parse(c.init.body as string)).toMatchObject({ turnstile_token: 'ts-token', user_id: 'pk' });
    const keys = f.calls.map((c) => c.init.headers['Idempotency-Key']);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('getStatus reads the last message with its status token', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('/v1/messages/') ? jsonResponse(200, { message_id: 'msg_1', status: 'delivered', created_at: 'x', events: [] }) : accepted(),
    ) as unknown as typeof globalThis.fetch;
    const { result } = renderHook(() => useSendEmail('svc', 'tpl'), { wrapper: wrapper({ publicKey: 'pk', fetch }) });
    await expect(result.current.getStatus()).rejects.toMatchObject({ code: 'not_initialized' });
    await act(async () => void (await result.current.send({})));
    const status = await result.current.getStatus();
    expect(status).toMatchObject({ messageId: 'msg_1', status: 'delivered' });
    expect(vi.mocked(fetch).mock.calls[1]![0]).toBe('https://api.frontmail.dev/v1/messages/msg_1?token=tok_1');
  });
});

describe('limitRate storage', () => {
  it('uses AsyncStorage when installed and throttles across sends', async () => {
    const store = new Map<string, string>();
    const asyncStorage = {
      getItem: vi.fn(async (k: string) => store.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    };
    optional.asyncStorage = () => asyncStorage;
    const fetch = vi.fn(async () => accepted()) as unknown as typeof globalThis.fetch;
    const { result } = renderHook(() => useSendEmail('svc', 'tpl'), {
      wrapper: wrapper({ publicKey: 'pk', fetch, limitRate: { id: 'contact', throttle: 60_000 } }),
    });
    await act(async () => void (await result.current.send({})));
    expect(result.current.status).toBe('sent');
    expect(asyncStorage.setItem).toHaveBeenCalledWith('frontmail:limit-rate:contact', expect.any(String));
    await act(async () => void (await result.current.send({})));
    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('rate_limited');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to memory with a dev warning when AsyncStorage is missing', async () => {
    optional.asyncStorage = () => null;
    vi.stubGlobal('__DEV__', true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = defaultStorageProvider();
    expect(warn).not.toHaveBeenCalled(); // lazy: nothing happens until limitRate uses it
    expect(await storage.get('k')).toBeNull();
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/async-storage is not installed/);
  });

  it('does not warn in production builds', async () => {
    optional.asyncStorage = () => null;
    vi.stubGlobal('__DEV__', false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await defaultStorageProvider().get('k');
    expect(warn).not.toHaveBeenCalled();
  });

  it('asyncStorageProvider swallows storage errors; memoryStorageProvider round-trips', async () => {
    const broken = asyncStorageProvider({
      getItem: () => Promise.reject(new Error('io')),
      setItem: () => Promise.reject(new Error('io')),
    });
    expect(await broken.get('k')).toBeNull();
    await expect(broken.set('k', 'v')).resolves.toBeUndefined();
    const mem = memoryStorageProvider();
    await mem.set('a', '1');
    expect(await mem.get('a')).toBe('1');
  });

  it('respects an explicit storageProvider', async () => {
    const asyncStorage = vi.fn(() => null);
    optional.asyncStorage = asyncStorage;
    const storageProvider = memoryStorageProvider();
    const { result } = renderHook(() => useFrontmail(), { wrapper: wrapper({ storageProvider }) });
    expect(result.current.options.storageProvider).toBe(storageProvider);
    expect(asyncStorage).not.toHaveBeenCalled();
  });
});

describe('uuid (idempotency keys) without crypto.randomUUID', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it('falls back to getRandomValues, then Math.random (Hermes without a polyfill)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    expect(uuid()).toMatch(V4);
    vi.stubGlobal('crypto', undefined);
    const random = vi.spyOn(Math, 'random');
    const ids = new Set(Array.from({ length: 200 }, () => uuid()));
    expect(random).toHaveBeenCalled();
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });
});

describe('<TurnstileWebView>', () => {
  it('renders inline HTML with baseUrl and reports tokens, expiry and errors', () => {
    const wv = createWebViewStub();
    const onToken = vi.fn();
    const onExpire = vi.fn();
    const onError = vi.fn();
    const ref = createRef<TurnstileWebViewHandle>();
    render(
      <TurnstileWebView
        ref={ref}
        siteKey="0x4AAA"
        baseUrl="https://example.com"
        onToken={onToken}
        onExpire={onExpire}
        onError={onError}
        theme="dark"
        WebViewComponent={wv.WebView}
      />,
    );
    const props = wv.state.last!.props as { source: { html: string; baseUrl: string }; originWhitelist: string[] };
    expect(props.source.baseUrl).toBe('https://example.com');
    expect(props.source.html).toContain('challenges.cloudflare.com/turnstile/v0/api.js');
    expect(props.source.html).toContain('"sitekey":"0x4AAA"');
    expect(props.source.html).toContain('"theme":"dark"');
    expect(props.source.html).toContain('window.ReactNativeWebView.postMessage');

    act(() => wv.post({ source: 'frontmail-turnstile', type: 'token', token: 'tok-1' }));
    expect(onToken).toHaveBeenCalledWith('tok-1');
    act(() => wv.post({ source: 'frontmail-turnstile', type: 'expired' }));
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => wv.post({ source: 'frontmail-turnstile', type: 'error', code: '110200' }));
    expect((onError.mock.calls[0]![0] as FrontmailError).code).toBe('captcha_failed');
    expect((onError.mock.calls[0]![0] as FrontmailError).message).toContain('110200');
    // Foreign or malformed messages are ignored.
    act(() => wv.post({ type: 'token', token: 'evil' }));
    act(() => wv.post('not json'));
    expect(onToken).toHaveBeenCalledTimes(1);

    ref.current!.reset();
    expect(wv.state.last!.injected.join()).toContain('turnstile.reset');
  });

  it('lazy-loads react-native-webview', () => {
    const wv = createWebViewStub();
    optional.webView = () => ({ WebView: wv.WebView });
    const { getByTestId } = render(<TurnstileWebView siteKey="k" baseUrl="https://example.com" onToken={() => {}} />);
    expect(getByTestId('webview')).toBeTruthy();
  });

  it('renders nothing and reports an error when react-native-webview is missing', async () => {
    optional.webView = () => null;
    const onError = vi.fn();
    const { container } = render(<TurnstileWebView siteKey="k" baseUrl="https://example.com" onToken={() => {}} onError={onError} />);
    expect(container.innerHTML).toBe('');
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'captcha_failed' });
  });

  it('escapes values embedded in the page', () => {
    const html = turnstileHtml({ siteKey: '</script><script>alert(1)</script>' });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });

  it('the token flows into send()', async () => {
    const wv = createWebViewStub();
    const fetch = vi.fn(async () => accepted()) as unknown as typeof globalThis.fetch;
    let send!: ReturnType<typeof useSendEmail>['send'];
    function Screen() {
      const hook = useSendEmail('svc', 'tpl');
      send = hook.send;
      return (
        <TurnstileWebView
          siteKey="k"
          baseUrl="https://example.com"
          WebViewComponent={wv.WebView}
          onToken={(token) => void hook.send({ name: 'Jan' }, { turnstileToken: token })}
        />
      );
    }
    render(
      <FrontmailProvider options={{ publicKey: 'pk', fetch }}>
        <Screen />
      </FrontmailProvider>,
    );
    expect(send).toBeTypeOf('function');
    await act(async () => wv.post({ source: 'frontmail-turnstile', type: 'token', token: 'tt' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ turnstile_token: 'tt' });
  });
});
