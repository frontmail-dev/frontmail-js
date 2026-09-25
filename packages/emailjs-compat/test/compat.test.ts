import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mod from '../src';
import emailjs, { EmailJSResponseStatus, init, send, sendForm } from '../src';
import { accepted, apiError, mockFetch } from './helpers';

/** Public surface of @emailjs/browser v4 (named exports + default object keys). */
const EMAILJS_NAMED = ['EmailJSResponseStatus', 'default', 'init', 'send', 'sendForm'];
const EMAILJS_DEFAULT = ['EmailJSResponseStatus', 'init', 'send', 'sendForm'];

beforeEach(() => {
  localStorage.clear();
  init({}, 'https://api.frontmail.dev');
});
afterEach(() => vi.unstubAllGlobals());

describe('surface parity with @emailjs/browser', () => {
  it('exports the same names', () => {
    expect(Object.keys(mod).filter((k) => k != 'DEFAULT_ORIGIN').sort()).toEqual(EMAILJS_NAMED);
    expect(Object.keys(emailjs).sort()).toEqual(EMAILJS_DEFAULT);
  });

  it('EmailJSResponseStatus has status/text with EmailJS defaults', () => {
    const s = new EmailJSResponseStatus();
    expect(s).toMatchObject({ status: 0, text: 'Network Error' });
    expect(new EmailJSResponseStatus(200, 'OK')).toMatchObject({ status: 200, text: 'OK' });
  });
});

describe('send / sendForm', () => {
  it('init(publicKey) → send hits the EmailJS alias path and resolves with 200 OK', async () => {
    const { fetch, calls } = mockFetch(accepted('held'));
    vi.stubGlobal('fetch', fetch);
    init('pk_legacy');
    const res = await send('svc', 'tpl', { name: 'Jan' });
    expect(res).toBeInstanceOf(EmailJSResponseStatus);
    expect(res).toMatchObject({ status: 200, text: 'OK', messageId: 'msg_1', deliveryStatus: 'held' });
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/api/v1.0/email/send');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({ service_id: 'svc', template_id: 'tpl', user_id: 'pk_legacy', template_params: { name: 'Jan' } });
    expect(calls[0]!.init.headers['X-Frontmail-Client']).toMatch(/^@frontmail\/emailjs-compat\//);
  });

  it('accepts options objects with user_id / publicKey / accessToken and a custom origin', async () => {
    const { fetch, calls } = mockFetch(accepted());
    vi.stubGlobal('fetch', fetch);
    init({ user_id: 'pk_old' }, 'http://localhost:3000');
    await send('svc', 'tpl', {});
    await send('svc', 'tpl', {}, { publicKey: 'pk_new' });
    await send('svc', 'tpl', {}, 'pk_str');
    await send('svc', 'tpl', {}, { accessToken: 'sk_1', dangerouslyAllowPrivateKeyInBrowser: true });
    expect(calls.map((c) => JSON.parse(c.init.body as string).user_id)).toEqual(['pk_old', 'pk_new', 'pk_str', 'pk_old']);
    expect(calls[0]!.url).toBe('http://localhost:3000/api/v1.0/email/send');
    expect(calls[3]!.init.headers.Authorization).toBe('Bearer sk_1');
  });

  it('refuses accessToken (private key) in a browser', async () => {
    const { fetch, calls } = mockFetch(accepted());
    vi.stubGlobal('fetch', fetch);
    const err = await send('svc', 'tpl', {}, { accessToken: 'sk_1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailJSResponseStatus);
    expect(err).toMatchObject({ status: 400, error: { code: 'private_key_in_browser' } });
    init({ publicKey: 'pk', accessToken: 'sk_1' });
    await expect(sendForm('svc', 'tpl', '#nope')).rejects.toMatchObject({ error: { code: 'private_key_in_browser' } });
    expect(calls).toHaveLength(0);
  });

  it('rejects without a public key', async () => {
    await expect(send('s', 't')).rejects.toMatchObject({ status: 400 });
  });

  it('sendForm posts multipart to the alias path', async () => {
    const { fetch, calls } = mockFetch(accepted());
    vi.stubGlobal('fetch', fetch);
    document.body.innerHTML = '<form id="f"><input name="user_name" value="Jan"></form>';
    const res = await sendForm('svc', 'tpl', '#f', 'pk');
    expect(res.status).toBe(200);
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/api/v1.0/email/send-form');
    const fd = calls[0]!.init.body as FormData;
    expect(fd.get('user_name')).toBe('Jan');
    expect(fd.get('user_id')).toBe('pk');
  });

  it('rejects API errors as EmailJSResponseStatus(status, text)', async () => {
    const { fetch } = mockFetch(apiError(422, 'invalid_template_params'));
    vi.stubGlobal('fetch', fetch);
    const err = await send('s', 't', {}, 'pk').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailJSResponseStatus);
    expect(err).toMatchObject({ status: 422, text: 'invalid_template_params message' });
    expect((err as EmailJSResponseStatus).error).toMatchObject({ code: 'invalid_template_params' });
  });

  it('maps client-side blocks to EmailJS statuses', async () => {
    const { fetch } = mockFetch(accepted());
    vi.stubGlobal('fetch', fetch);
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    await expect(send('s', 't', {}, { publicKey: 'pk', blockHeadless: true })).rejects.toMatchObject({
      status: 451,
      text: 'Unavailable For Headless Browser',
    });
    delete (navigator as { webdriver?: boolean }).webdriver;

    await expect(
      send('s', 't', { email: 'x@y.cz' }, { publicKey: 'pk', blockList: { list: ['x@y.cz'], watchVariable: 'email' } }),
    ).rejects.toMatchObject({ status: 403, text: 'Forbidden' });

    const limited = { publicKey: 'pk', limitRate: { id: 'form', throttle: 60000 } };
    await expect(send('s', 't', {}, limited)).resolves.toMatchObject({ status: 200 });
    await expect(send('s', 't', {}, limited)).rejects.toMatchObject({ status: 429, text: 'Too Many Requests' });
  });

  it('uses a custom storageProvider for limitRate', async () => {
    const { fetch } = mockFetch(accepted());
    vi.stubGlobal('fetch', fetch);
    const store = new Map<string, string>();
    const storageProvider = { get: async (k: string) => store.get(k), set: async (k: string, v: string) => void store.set(k, v) };
    await send('s', 't', {}, { publicKey: 'pk', limitRate: { id: 'x', throttle: 1000 }, storageProvider });
    expect([...store.keys()]).toEqual(['frontmail:limit-rate:x']);
    expect(localStorage.length).toBe(0);
  });

  it('maps network failures to status 0', async () => {
    const { fetch } = mockFetch(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    vi.useFakeTimers();
    const p = send('s', 't', {}, 'pk').catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ status: 0, text: 'Network Error' });
    vi.useRealTimers();
  });
});
