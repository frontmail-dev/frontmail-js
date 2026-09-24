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
import { _resetPublicConfigCache } from '@frontmail/sdk-core';
import { optional } from '../src/optional';
import { _resetOrgTurnstileTokens, markOrgTurnstileToken, withTurnstileKey } from '../src/turnstile-key';
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

describe('<TurnstileWebView> with the shared Frontmail key', () => {
  const CONFIG = { turnstile: { mobileSiteKey: '0xMOBILE', mobileBaseUrl: 'https://mobile.frontmail.test' } };
  afterEach(() => {
    _resetPublicConfigCache();
    _resetOrgTurnstileTokens();
  });

  const router = (config: unknown) =>
    vi.fn(async (url: string) => (url.endsWith('/v1/public-config') ? jsonResponse(200, config) : accepted())) as unknown as typeof globalThis.fetch &
      ReturnType<typeof vi.fn>;

  it('loads the key from the provider apiUrl and sends the token without turnstile_key', async () => {
    const wv = createWebViewStub();
    const fetch = router(CONFIG);
    function Screen() {
      const hook = useSendEmail('svc', 'tpl');
      return <TurnstileWebView WebViewComponent={wv.WebView} onToken={(token) => void hook.send({}, { turnstileToken: token })} />;
    }
    const { container } = render(
      <FrontmailProvider options={{ publicKey: 'pk', apiUrl: 'https://api.test', fetch }}>
        <Screen />
      </FrontmailProvider>,
    );
    expect(container.innerHTML).toBe('');
    await waitFor(() => expect(wv.state.last).toBeDefined());
    expect(fetch.mock.calls[0]![0]).toBe('https://api.test/v1/public-config');
    const props = wv.state.last!.props as { source: { html: string; baseUrl: string } };
    expect(props.source.baseUrl).toBe('https://mobile.frontmail.test');
    expect(props.source.html).toContain('"sitekey":"0xMOBILE"');

    await act(async () => wv.post({ source: 'frontmail-turnstile', type: 'token', token: 'shared-tok' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse((fetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.turnstile_token).toBe('shared-tok');
    expect(body).not.toHaveProperty('turnstile_key');
  });

  it('uses the apiUrl prop outside a provider and caches the config', async () => {
    const fetch = router(CONFIG);
    vi.stubGlobal('fetch', fetch);
    const a = createWebViewStub();
    const b = createWebViewStub();
    render(
      <>
        <TurnstileWebView apiUrl="https://api.other" WebViewComponent={a.WebView} onToken={() => {}} />
        <TurnstileWebView apiUrl="https://api.other" WebViewComponent={b.WebView} onToken={() => {}} />
      </>,
    );
    await waitFor(() => expect(a.state.last && b.state.last).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe('https://api.other/v1/public-config');
  });

  it('reports an error when the API has no shared key and retries on reset()', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, { turnstile: { mobileSiteKey: null, mobileBaseUrl: null } })) as unknown as typeof globalThis.fetch &
      ReturnType<typeof vi.fn>;
    vi.stubGlobal('fetch', fetch);
    const wv = createWebViewStub();
    const onError = vi.fn();
    const ref = createRef<TurnstileWebViewHandle>();
    const { container } = render(<TurnstileWebView ref={ref} WebViewComponent={wv.WebView} onToken={() => {}} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'captcha_failed', details: { reason: 'not_configured' } });
    expect(container.innerHTML).toBe('');
    expect(fetch.mock.calls[0]![0]).toBe('https://api.frontmail.dev/v1/public-config');

    fetch.mockImplementation(async () => jsonResponse(200, CONFIG));
    _resetPublicConfigCache();
    act(() => ref.current!.reset());
    await waitFor(() => expect(wv.state.last).toBeDefined());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a failed config request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => apiError(503, 'service_unavailable')));
    const onError = vi.fn();
    render(<TurnstileWebView WebViewComponent={createWebViewStub().WebView} onToken={() => {}} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'service_unavailable', status: 503 });
  });

  it('requires baseUrl with a custom siteKey', async () => {
    const onError = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(<TurnstileWebView siteKey="0xOWN" WebViewComponent={createWebViewStub().WebView} onToken={() => {}} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'captcha_failed', details: { reason: 'missing_base_url' } });
    expect(container.innerHTML).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends tokens from a custom siteKey with turnstile_key "org"', async () => {
    const wv = createWebViewStub();
    const fetch = router(CONFIG);
    let hook!: ReturnType<typeof useSendEmail>;
    let client!: ReturnType<typeof useFrontmail>;
    const tokens: string[] = [];
    function Screen() {
      hook = useSendEmail('svc', 'tpl');
      client = useFrontmail();
      return <TurnstileWebView siteKey="0xOWN" baseUrl="https://example.com" WebViewComponent={wv.WebView} onToken={(t) => tokens.push(t)} />;
    }
    render(
      <FrontmailProvider options={{ publicKey: 'pk', fetch }}>
        <Screen />
      </FrontmailProvider>,
    );
    expect((wv.state.last!.props as { source: { baseUrl: string } }).source.baseUrl).toBe('https://example.com');
    await act(async () => wv.post({ source: 'frontmail-turnstile', type: 'token', token: 'own-1' }));
    await act(async () => wv.post({ source: 'frontmail-turnstile', type: 'token', token: 'own-2' }));
    expect(tokens).toEqual(['own-1', 'own-2']);

    await act(async () => void (await hook.send({}, { turnstileToken: 'own-1' })));
    await act(async () => void (await client.send('svc', 'tpl', {}, { turnstileToken: 'own-2' })));
    await act(async () => void (await hook.send({}, { turnstileToken: 'own-1', turnstileKey: 'frontmail' })));
    await act(async () => void (await hook.send({}, { turnstileToken: 'unknown' })));
    const bodies = fetch.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies.map((b) => b.turnstile_key)).toEqual(['org', 'org', 'frontmail', undefined]);
    // A custom key never triggers the public-config request.
    expect(fetch.mock.calls.some((c) => String(c[0]).includes('public-config'))).toBe(false);
  });
});

describe('custom-key token registry', () => {
  afterEach(() => _resetOrgTurnstileTokens());
  it('is bounded and leaves other options untouched', () => {
    expect(withTurnstileKey(undefined)).toBeUndefined();
    const plain = { turnstileToken: 't0' };
    expect(withTurnstileKey(plain)).toBe(plain);
    for (let i = 0; i < 40; i++) markOrgTurnstileToken('t' + i);
    expect(withTurnstileKey({ turnstileToken: 't0' })?.turnstileKey).toBeUndefined();
    expect(withTurnstileKey({ turnstileToken: 't39' })?.turnstileKey).toBe('org');
    expect(withTurnstileKey({ turnstileToken: 't8' })?.turnstileKey).toBe('org');
    expect(withTurnstileKey({ turnstileToken: 't7' })?.turnstileKey).toBeUndefined();
  });
});
