import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrontmail, frontmailForm } from '../src/index';
import type { SendStatus, TurnstileApi } from '../src/index';
import Harness from './Harness.svelte';
import { accepted, apiError } from './helpers';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
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

describe('createFrontmail', () => {
  it.each([
    ['queued', 'sent'],
    ['held', 'held'],
  ] as const)('status store: idle → sending → %s maps to %s', async (apiStatus, expected) => {
    const f = deferredFetch();
    const fm = createFrontmail({ publicKey: 'pk', fetch: f.fetch });
    expect(fm.client.options.clientName).toMatch(/^@frontmail\/svelte\//);
    const seen: SendStatus[] = [];
    const unsub = fm.status.subscribe((s) => seen.push(s));
    const p = fm.send('svc', 'tpl', { a: 1 });
    expect(get(fm.status)).toBe('sending');
    await f.respond(accepted(apiStatus));
    await expect(p).resolves.toMatchObject({ messageId: 'msg_1' });
    expect(seen).toEqual(['idle', 'sending', expected]);
    expect(get(fm.state).result?.status).toBe(apiStatus);
    fm.reset();
    expect(get(fm.status)).toBe('idle');
    unsub();
  });

  it('status store: idle → sending → error', async () => {
    const f = deferredFetch();
    const fm = createFrontmail({ publicKey: 'pk', fetch: f.fetch, retry: false });
    const p = fm.send('svc', 'tpl');
    await f.respond(apiError(402, 'insufficient_credits'));
    await expect(p).resolves.toBeUndefined();
    expect(get(fm.state)).toMatchObject({ status: 'error', error: { name: 'InsufficientCreditsError' } });
  });

  it('sendForm posts multipart', async () => {
    const f = deferredFetch();
    const fm = createFrontmail({ publicKey: 'pk', fetch: f.fetch });
    document.body.innerHTML = '<form id="f"><input name="x" value="1"></form>';
    const p = fm.sendForm('svc', 'tpl', '#f');
    await f.respond(accepted());
    await p;
    expect((f.calls[0]!.body as FormData).get('x')).toBe('1');
  });
});

describe('use:frontmailForm', () => {
  it('submits the form, mirrors data-status and calls callbacks', async () => {
    (globalThis as { turnstile?: TurnstileApi }).turnstile = fakeTurnstile();
    const f = deferredFetch();
    const fm = createFrontmail({ publicKey: 'pk', fetch: f.fetch });
    document.body.innerHTML = '<form><input name="email" value="a@b.cz"></form>';
    const form = document.forms[0]!;
    const onSuccess = vi.fn();
    const states: string[] = [];
    const action = frontmailForm(form, {
      frontmail: fm,
      serviceId: 'svc',
      templateId: 'tpl',
      turnstileSiteKey: 'site',
      onSuccess,
      onState: (s) => states.push(s.status),
    });
    expect(form.dataset.status).toBe('idle');
    await waitFor(() => expect(form.querySelector('input[name="cf-turnstile-response"]')).not.toBeNull());
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(form.dataset.status).toBe('sending');
    await f.respond(accepted());
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(form.dataset.status).toBe('sent');
    expect(states).toEqual(['sending', 'sent']);
    expect(get(fm.status)).toBe('sent');
    const fd = f.calls[0]!.body as FormData;
    expect(fd.get('email')).toBe('a@b.cz');
    expect(fd.get('cf-turnstile-response')).toBe('ts-token');
    action.destroy();
    expect(form.querySelector('.frontmail-turnstile')).toBeNull();
  });

  it('reports a missing instance as an error', async () => {
    vi.resetModules();
    const mod = await import('../src/index');
    document.body.innerHTML = '<form></form>';
    const onError = vi.fn();
    mod.frontmailForm(document.forms[0]!, { templateId: 'tpl', onError });
    document.forms[0]!.dispatchEvent(new Event('submit', { cancelable: true }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'not_initialized' })));
  });
});

describe('<FrontmailForm>', () => {
  it('idle → sending → sent with Turnstile and context instance', async () => {
    const turnstile = fakeTurnstile();
    (globalThis as { turnstile?: TurnstileApi }).turnstile = turnstile;
    const f = deferredFetch();
    const onSuccess = vi.fn();
    render(Harness, { frontmail: createFrontmail({ publicKey: 'pk', fetch: f.fetch }), turnstileSiteKey: 'site', onSuccess });
    await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    expect(screen.getByTestId('status').textContent).toBe('idle');
    await fireEvent.submit(screen.getByTestId('form'));
    expect(screen.getByTestId('status').textContent).toBe('sending');
    await f.respond(accepted('held'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('held'));
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ status: 'held' }));
    expect((f.calls[0]!.body as FormData).get('cf-turnstile-response')).toBe('ts-token');
    expect(turnstile.reset).toHaveBeenCalledWith('w1');
  });

  it('idle → sending → error', async () => {
    const f = deferredFetch();
    const onError = vi.fn();
    render(Harness, { frontmail: createFrontmail({ publicKey: 'pk', fetch: f.fetch, retry: false }), onError });
    await fireEvent.submit(screen.getByTestId('form'));
    await f.respond(apiError(403, 'origin_not_allowed'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error:origin_not_allowed'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'AuthError' }));
  });
});
