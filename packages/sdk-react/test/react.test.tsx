import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontmailForm, FrontmailProvider, useFrontmail, useSendEmail } from '../src';
import type { FrontmailOptions, SendResult, TurnstileApi } from '../src';
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
    await act(async () => resolve!(r));
  };
  return { fetch, calls, respond };
}

const wrapper = (options: FrontmailOptions) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <FrontmailProvider options={options}>{children}</FrontmailProvider>;
  };

describe('useFrontmail', () => {
  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useFrontmail())).toThrow(/FrontmailProvider/);
    vi.restoreAllMocks();
  });

  it('returns a client with the React client name', () => {
    const { result } = renderHook(() => useFrontmail(), { wrapper: wrapper({ publicKey: 'pk' }) });
    expect(result.current.options.clientName).toMatch(/^@frontmail\/react\//);
  });
});

describe('useSendEmail', () => {
  it.each([
    ['queued', 'sent'],
    ['held', 'held'],
  ] as const)('idle → sending → %s maps to %s', async (apiStatus, expected) => {
    const f = deferredFetch();
    const { result } = renderHook(() => useSendEmail('svc', 'tpl'), { wrapper: wrapper({ publicKey: 'pk', fetch: f.fetch }) });
    expect(result.current.status).toBe('idle');
    let p!: Promise<SendResult | undefined>;
    act(() => {
      p = result.current.send({ name: 'Jan' });
    });
    await waitFor(() => expect(result.current.status).toBe('sending'));
    await f.respond(accepted(apiStatus));
    await act(async () => void (await p));
    expect(result.current.status).toBe(expected);
    expect(result.current.result?.messageId).toBe('msg_1');
    expect(result.current.error).toBeNull();
    await expect(p).resolves.toMatchObject({ status: apiStatus });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
  });

  it('idle → sending → error with a typed error', async () => {
    const f = deferredFetch();
    const { result } = renderHook(() => useSendEmail('svc', 'tpl'), {
      wrapper: wrapper({ publicKey: 'pk', fetch: f.fetch, retry: false }),
    });
    let p!: Promise<SendResult | undefined>;
    act(() => {
      p = result.current.send({});
    });
    expect(result.current.status).toBe('sending');
    await f.respond(apiError(422, 'invalid_template_params'));
    await act(async () => void (await p));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatchObject({ name: 'ValidationError', code: 'invalid_template_params', status: 422 });
    await expect(p).resolves.toBeUndefined();
  });
});

function fakeTurnstile(): TurnstileApi {
  return {
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
}

describe('<FrontmailForm>', () => {
  it('renders Turnstile, submits via sendForm and reports success', async () => {
    const turnstile = fakeTurnstile();
    (globalThis as { turnstile?: TurnstileApi }).turnstile = turnstile;
    const f = deferredFetch();
    const onSuccess = vi.fn();
    render(
      <FrontmailProvider options={{ publicKey: 'pk', fetch: f.fetch }}>
        <FrontmailForm serviceId="svc" templateId="tpl" turnstileSiteKey="site" onSuccess={onSuccess} data-testid="form">
          {({ status }) => (
            <>
              <input name="email" defaultValue="a@b.cz" data-testid="email" />
              <button type="submit">Send</button>
              <p data-testid="status">{status}</p>
            </>
          )}
        </FrontmailForm>
      </FrontmailProvider>,
    );
    await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    expect(screen.getByTestId('status').textContent).toBe('idle');
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('sending'));
    expect(screen.getByTestId('form').getAttribute('data-status')).toBe('sending');
    const fd = f.calls[0]!.body as FormData;
    expect(fd.get('email')).toBe('a@b.cz');
    expect(fd.get('cf-turnstile-response')).toBe('ts-token');
    expect(fd.get('template_id')).toBe('tpl');
    await f.respond(accepted());
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('sent'));
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg_1', status: 'queued' }));
    expect(turnstile.reset).toHaveBeenCalledWith('w1');
  });

  it('reports errors through onError and the render prop', async () => {
    const f = deferredFetch();
    const onError = vi.fn();
    render(
      <FrontmailProvider options={{ publicKey: 'pk', fetch: f.fetch, retry: false }}>
        <FrontmailForm templateId="tpl" onError={onError} data-testid="form">
          {({ status, error }) => <p data-testid="status">{status + (error ? ':' + error.code : '')}</p>}
        </FrontmailForm>
      </FrontmailProvider>,
    );
    fireEvent.submit(screen.getByTestId('form'));
    await f.respond(apiError(402, 'insufficient_credits'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error:insufficient_credits'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatchObject({ name: 'InsufficientCreditsError' });
  });
});
