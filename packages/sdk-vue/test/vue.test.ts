import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Frontmail, { FrontmailForm, useFrontmail, useSendEmail } from '../src';
import type { FrontmailOptions, TurnstileApi, UseSendEmail } from '../src';
import { accepted, apiError } from './helpers';

afterEach(() => {
  cleanup();
  delete (globalThis as { turnstile?: unknown }).turnstile;
});

function deferredFetch() {
  let resolve: ((r: Response) => void) | undefined;
  const calls: RequestInit[] = [];
  const fetch = vi.fn((_url: string, init: RequestInit) => {
    calls.push(init);
    return new Promise<Response>((r) => (resolve = r));
  }) as unknown as typeof globalThis.fetch;
  const respond = async (r: Response) => {
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    resolve!(r);
  };
  return { fetch, calls, respond };
}

function mountComposable(options: FrontmailOptions) {
  let api!: UseSendEmail<'tpl'>;
  const Comp = defineComponent({
    setup() {
      api = useSendEmail('svc', 'tpl');
      return () => h('p', { 'data-testid': 'status' }, api.status.value);
    },
  });
  render(Comp, { global: { plugins: [[Frontmail, options]] } });
  return () => api;
}

describe('plugin', () => {
  it('provides a client', () => {
    let clientName: string | undefined;
    const Comp = defineComponent({
      setup() {
        clientName = useFrontmail().options.clientName;
        return () => null;
      },
    });
    render(Comp, { global: { plugins: [[Frontmail, { publicKey: 'pk' }]] } });
    expect(clientName).toMatch(/^@frontmail\/vue\//);
  });

  it('refuses a private key in the browser unless explicitly allowed', () => {
    expect(() => createApp({ render: () => null }).use(Frontmail, { privateKey: 'sk_1' })).toThrowError(
      expect.objectContaining({ code: 'private_key_in_browser' }),
    );
    expect(() =>
      createApp({ render: () => null }).use(Frontmail, { privateKey: 'sk_1', dangerouslyAllowPrivateKeyInBrowser: true }),
    ).not.toThrow();
  });

  it('throws without the plugin', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Comp = defineComponent({
      setup() {
        useFrontmail();
        return () => null;
      },
    });
    expect(() => render(Comp)).toThrow(/app.use/);
    vi.restoreAllMocks();
  });
});

describe('useSendEmail', () => {
  it.each([
    ['queued', 'sent'],
    ['held', 'held'],
  ] as const)('idle → sending → %s maps to %s', async (apiStatus, expected) => {
    const f = deferredFetch();
    const api = mountComposable({ publicKey: 'pk', fetch: f.fetch });
    expect(api().status.value).toBe('idle');
    const p = api().send({ a: 1 });
    await nextTick();
    expect(screen.getByTestId('status').textContent).toBe('sending');
    await f.respond(accepted(apiStatus));
    await expect(p).resolves.toMatchObject({ messageId: 'msg_1' });
    await nextTick();
    expect(screen.getByTestId('status').textContent).toBe(expected);
    expect(api().result.value?.status).toBe(apiStatus);
    api().reset();
    expect(api().status.value).toBe('idle');
  });

  it('idle → sending → error', async () => {
    const f = deferredFetch();
    const api = mountComposable({ publicKey: 'pk', fetch: f.fetch, retry: false });
    const p = api().send({});
    expect(api().status.value).toBe('sending');
    await f.respond(apiError(401, 'invalid_public_key'));
    await expect(p).resolves.toBeUndefined();
    expect(api().status.value).toBe('error');
    expect(api().error.value).toMatchObject({ name: 'AuthError', code: 'invalid_public_key' });
  });
});

describe('<FrontmailForm>', () => {
  it('renders Turnstile, submits and emits success', async () => {
    const turnstile: TurnstileApi = {
      render: vi.fn((el: HTMLElement | string) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'cf-turnstile-response';
        input.value = 'ts-token';
        (el as HTMLElement).appendChild(input);
        return 'w1';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
      getResponse: vi.fn(),
    };
    (globalThis as { turnstile?: TurnstileApi }).turnstile = turnstile;
    const f = deferredFetch();
    const onSuccess = vi.fn();
    const App = defineComponent({
      setup() {
        return () =>
          h(
            FrontmailForm,
            { serviceId: 'svc', templateId: 'tpl', turnstileSiteKey: 'site', onSuccess, 'data-testid': 'form' },
            {
              default: ({ status }: { status: string }) => [
                h('input', { name: 'email', value: 'a@b.cz' }),
                h('p', { 'data-testid': 'status' }, status),
              ],
            },
          );
      },
    });
    render(App, { global: { plugins: [[Frontmail, { publicKey: 'pk', fetch: f.fetch }]] } });
    await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    await fireEvent.submit(screen.getByTestId('form'));
    expect(screen.getByTestId('status').textContent).toBe('sending');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect((f.calls[0]!.body as FormData).get('cf-turnstile-response')).toBe('ts-token');
    expect((f.calls[0]!.body as FormData).get('email')).toBe('a@b.cz');
    await f.respond(accepted());
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('sent'));
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg_1' }));
    expect(turnstile.reset).toHaveBeenCalledWith('w1');
  });

  it('emits error', async () => {
    const f = deferredFetch();
    const onError = vi.fn();
    render(
      defineComponent({
        setup: () => () =>
          h(FrontmailForm, { templateId: 'tpl', onError, 'data-testid': 'form' }, {
            default: ({ status }: { status: string }) => h('p', { 'data-testid': 'status' }, status),
          }),
      }),
      { global: { plugins: [[Frontmail, { publicKey: 'pk', fetch: f.fetch, retry: false }]] } },
    );
    await fireEvent.submit(screen.getByTestId('form'));
    await f.respond(apiError(429, 'rate_limited', { 'Retry-After': '999' }));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'RateLimitError', retryAfter: 999 }));
  });

  it('is registered globally by the plugin', () => {
    const app = createApp({ render: () => null });
    app.use(Frontmail, { publicKey: 'pk' });
    expect(app.component('FrontmailForm')).toBe(FrontmailForm);
  });
});
