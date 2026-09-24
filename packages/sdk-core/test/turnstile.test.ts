import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontmailError, TURNSTILE_SCRIPT_URL, _resetTurnstileLoader, getTurnstileToken, loadTurnstile, renderTurnstile } from '../src';
import type { TurnstileApi, TurnstileRenderOptions } from '../src';

type G = { turnstile?: TurnstileApi };

function fakeTurnstile(behaviour: 'success' | 'error' = 'success'): TurnstileApi & { rendered: TurnstileRenderOptions[] } {
  const rendered: TurnstileRenderOptions[] = [];
  return {
    rendered,
    render: vi.fn((_el, opts) => {
      rendered.push(opts);
      setTimeout(() => (behaviour == 'success' ? opts.callback?.('token-123') : opts['error-callback']?.('110200')));
      return 'w1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
    getResponse: vi.fn(() => 'from-api'),
  };
}

afterEach(() => {
  delete (globalThis as G).turnstile;
  _resetTurnstileLoader();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('turnstile', () => {
  it('loads the script lazily once', async () => {
    const p1 = loadTurnstile();
    const p2 = loadTurnstile();
    expect(p1).toBe(p2);
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe(TURNSTILE_SCRIPT_URL);
    (globalThis as G).turnstile = fakeTurnstile();
    scripts[0]!.onload!(new Event('load'));
    await expect(p1).resolves.toBe((globalThis as G).turnstile);
  });

  it('rejects when the script fails and allows a retry', async () => {
    const p = loadTurnstile();
    document.head.querySelector('script')!.onerror!(new Event('error'));
    await expect(p).rejects.toMatchObject({ code: 'captcha_failed' });
    expect(document.head.querySelector('script')).toBeNull();
    expect(loadTurnstile()).not.toBe(p);
  });

  it('renders a widget', async () => {
    const api = fakeTurnstile();
    (globalThis as G).turnstile = api;
    const el = document.createElement('div');
    const { widgetId } = await renderTurnstile(el, { sitekey: 'key' });
    expect(widgetId).toBe('w1');
    expect(api.render).toHaveBeenCalledWith(el, { sitekey: 'key' });
  });

  it('reads the token from a form', async () => {
    document.body.innerHTML = `<form><div><input name="cf-turnstile-response" value="abc"></div></form>`;
    await expect(getTurnstileToken(document.forms[0]!)).resolves.toBe('abc');
  });

  it('falls back to turnstile.getResponse and errors without a token', async () => {
    document.body.innerHTML = `<form></form>`;
    await expect(getTurnstileToken(document.forms[0]!)).rejects.toBeInstanceOf(FrontmailError);
    (globalThis as G).turnstile = fakeTurnstile();
    await expect(getTurnstileToken(document.forms[0]!)).resolves.toBe('from-api');
  });

  it('gets a token for a site key with an invisible widget and cleans up', async () => {
    const api = fakeTurnstile();
    (globalThis as G).turnstile = api;
    await expect(getTurnstileToken('site-key')).resolves.toBe('token-123');
    expect(api.rendered[0]).toMatchObject({ sitekey: 'site-key', size: 'invisible' });
    expect(api.remove).toHaveBeenCalledWith('w1');
    expect(document.body.children).toHaveLength(0);
  });

  it('rejects on widget errors', async () => {
    (globalThis as G).turnstile = fakeTurnstile('error');
    await expect(getTurnstileToken('site-key')).rejects.toMatchObject({ code: 'captcha_failed' });
  });
});
