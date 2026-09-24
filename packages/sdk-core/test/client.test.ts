import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  BlockedError,
  FrontmailError,
  InsufficientCreditsError,
  NetworkError,
  RateLimitError,
  ValidationError,
  createClient,
} from '../src';
import { accepted, apiError, jsonResponse, mockFetch } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Runs a promise to completion while advancing fake timers. */
async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const out: { value?: T; error?: unknown } = {};
  const done = p.then((v) => (out.value = v)).catch((e: unknown) => (out.error = e));
  await vi.runAllTimersAsync();
  await done;
  return out;
}

describe('send', () => {
  it('posts the EmailJS-compatible body and maps the result', async () => {
    const { fetch, calls } = mockFetch(accepted('held'));
    const client = createClient({ publicKey: 'pk_1', apiUrl: 'https://api.test/', fetch, clientName: '@frontmail/test/1.0.0' });
    const { value } = await settle(client.send('svc_1', 'tpl_1', { name: 'Jan' }, { turnstileToken: 'ts' }));
    expect(value).toEqual({ messageId: 'msg_1', status: 'held', statusToken: 'tok_1', status_code: 202, text: 'OK' });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe('https://api.test/v1/send');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      service_id: 'svc_1',
      template_id: 'tpl_1',
      user_id: 'pk_1',
      template_params: { name: 'Jan' },
      turnstile_token: 'ts',
    });
    expect(init.headers['X-Frontmail-Client']).toBe('@frontmail/test/1.0.0');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends turnstile_key only when set', async () => {
    const { fetch, calls } = mockFetch(accepted());
    const client = createClient({ publicKey: 'pk_1', fetch });
    await settle(client.send('s', 't', {}, { turnstileToken: 'ts', turnstileKey: 'org' }));
    await settle(client.send('s', 't', {}, { turnstileToken: 'ts' }));
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ turnstile_token: 'ts', turnstile_key: 'org' });
    expect(JSON.parse(calls[1]!.init.body as string)).not.toHaveProperty('turnstile_key');
  });

  it('uses the private key as bearer token and maps attachments', async () => {
    const { fetch, calls } = mockFetch(accepted());
    const client = createClient({ privateKey: 'sk_1', fetch });
    await settle(
      client.send(null, 'tpl_1', {}, {
        attachments: [{ uploadId: 'upl_1' }, { filename: 'a.txt', contentType: 'text/plain', contentBase64: 'YQ==' }],
      }),
    );
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/send');
    expect(calls[0]!.init.headers.Authorization).toBe('Bearer sk_1');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.service_id).toBeUndefined();
    expect(body.attachments).toEqual([
      { upload_id: 'upl_1' },
      { filename: 'a.txt', content_type: 'text/plain', content_base64: 'YQ==' },
    ]);
  });

  it('generates a fresh idempotency key per logical send and honours an explicit one', async () => {
    const { fetch, calls } = mockFetch(accepted());
    const client = createClient({ publicKey: 'pk', fetch });
    await settle(client.send('s', 't'));
    await settle(client.send('s', 't'));
    await settle(client.send('s', 't', {}, { idempotencyKey: 'my-key' }));
    const keys = calls.map((c) => c.init.headers['Idempotency-Key']);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBe('my-key');
  });

  it('falls back to getRandomValues when randomUUID is unavailable', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(undefined as never);
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const { fetch, calls } = mockFetch(accepted());
      await settle(createClient({ fetch }).send('s', 't'));
      expect(calls[0]!.init.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      // restore the prototype implementation
      delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
    }
  });

  it('rejects malformed success responses', async () => {
    const { fetch } = mockFetch(jsonResponse(202, { nope: true }));
    const { error } = await settle(createClient({ fetch }).send('s', 't'));
    expect(error).toBeInstanceOf(FrontmailError);
    expect((error as FrontmailError).code).toBe('invalid_response');
  });
});

describe('retries', () => {
  it('retries network errors and 5xx with the same idempotency key', async () => {
    const { fetch, calls } = mockFetch(new TypeError('Failed to fetch'), apiError(503, 'service_unavailable'), apiError(502, 'provider_error'), accepted());
    const { value } = await settle(createClient({ fetch }).send('s', 't'));
    expect(value?.messageId).toBe('msg_1');
    expect(calls).toHaveLength(4);
    const keys = new Set(calls.map((c) => c.init.headers['Idempotency-Key']));
    expect(keys.size).toBe(1);
  });

  it('uses exponential backoff with full jitter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const timeouts: number[] = [];
    const orig = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms !== 15000) timeouts.push(ms ?? 0);
      return orig(fn, ms);
    }) as typeof setTimeout);
    const { fetch } = mockFetch(apiError(500, 'internal_error'));
    const { error } = await settle(createClient({ fetch, retry: { baseDelayMs: 100, maxDelayMs: 300 } }).send('s', 't'));
    expect(error).toBeInstanceOf(FrontmailError);
    // 0.5 * min(300, 100 * 2^n) for n = 0, 1, 2
    expect(timeouts).toEqual([50, 100, 150]);
  });

  it('gives up after the default 3 retries', async () => {
    const { fetch, calls } = mockFetch(new TypeError('offline'));
    const { error } = await settle(createClient({ fetch }).send('s', 't'));
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).code).toBe('network_error');
    expect((error as NetworkError).status).toBe(0);
    expect(calls).toHaveLength(4);
  });

  it('honours Retry-After on 429', async () => {
    const { fetch, calls } = mockFetch(apiError(429, 'rate_limited', { 'Retry-After': '2' }), accepted());
    const p = createClient({ fetch }).send('s', 't');
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(p).resolves.toMatchObject({ messageId: 'msg_1' });
  });

  it('does not retry when Retry-After is too long', async () => {
    const { fetch, calls } = mockFetch(apiError(429, 'rate_limited', { 'Retry-After': '3600' }));
    const { error } = await settle(createClient({ fetch }).send('s', 't'));
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBe(3600);
    expect(calls).toHaveLength(1);
  });

  it('does not retry 4xx responses', async () => {
    const { fetch, calls } = mockFetch(apiError(422, 'invalid_template_params'));
    await settle(createClient({ fetch }).send('s', 't'));
    expect(calls).toHaveLength(1);
  });

  it('can be disabled', async () => {
    const { fetch, calls } = mockFetch(apiError(500, 'internal_error'));
    await settle(createClient({ fetch, retry: false }).send('s', 't'));
    expect(calls).toHaveLength(1);
  });

  it('times out slow attempts and retries them', async () => {
    let n = 0;
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          if (++n == 2) return resolve(accepted());
          init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    ) as unknown as typeof globalThis.fetch;
    const { value } = await settle(createClient({ fetch, timeoutMs: 1000 }).send('s', 't'));
    expect(value?.messageId).toBe('msg_1');
    expect(n).toBe(2);
  });

  it('reports a timeout error code', async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('abort')))),
    ) as unknown as typeof globalThis.fetch;
    const { error } = await settle(createClient({ fetch, timeoutMs: 100, retry: false }).send('s', 't'));
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).code).toBe('timeout');
  });

  it('does not retry a user abort', async () => {
    const ctrl = new AbortController();
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('abort')))),
    ) as unknown as typeof globalThis.fetch;
    const p = createClient({ fetch }).send('s', 't', {}, { signal: ctrl.signal });
    ctrl.abort();
    const { error } = await settle(p);
    expect((error as FrontmailError).code).toBe('aborted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('error mapping', () => {
  const cases: Array<[number, string, new (...a: never[]) => FrontmailError]> = [
    [400, 'invalid_body', ValidationError],
    [401, 'invalid_public_key', AuthError],
    [402, 'insufficient_credits', InsufficientCreditsError],
    [403, 'origin_not_allowed', AuthError],
    [403, 'private_key_required', AuthError],
    [403, 'captcha_failed', FrontmailError],
    [403, 'captcha_not_configured', FrontmailError],
    [404, 'template_not_found', FrontmailError],
    [409, 'idempotency_conflict', FrontmailError],
    [413, 'payload_too_large', FrontmailError],
    [422, 'invalid_template_params', ValidationError],
    [429, 'rate_limited', RateLimitError],
    [451, 'recipient_suppressed', FrontmailError],
    [500, 'internal_error', FrontmailError],
    [502, 'provider_error', FrontmailError],
    [503, 'service_unavailable', FrontmailError],
  ];
  it.each(cases)('%i %s', async (status, code, Ctor) => {
    const { fetch } = mockFetch(apiError(status, code));
    const { error } = await settle(createClient({ fetch, retry: false }).send('s', 't'));
    expect(error).toBeInstanceOf(Ctor);
    expect(error).toBeInstanceOf(FrontmailError);
    expect(error).toMatchObject({ code, status, message: code + ' message', docsUrl: 'https://docs/x', details: { a: 1 } });
    expect((error as Error).name).toBe(Ctor.name);
  });

  it('handles non-JSON error bodies', async () => {
    const { fetch } = mockFetch(() => new Response('<html>Bad gateway</html>', { status: 504 }));
    const { error } = await settle(createClient({ fetch, retry: false }).send('s', 't'));
    expect(error).toMatchObject({ code: 'internal_error', status: 504 });
    expect((error as FrontmailError).docsUrl).toBe('https://docs.frontmail.dev/reference/errors/#internal-error');
  });
});

describe('client guards', () => {
  it('blocks headless browsers before calling the API', async () => {
    const { fetch } = mockFetch(accepted());
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    const { error } = await settle(createClient({ fetch, blockHeadless: true }).send('s', 't'));
    delete (navigator as { webdriver?: boolean }).webdriver;
    expect(error).toBeInstanceOf(BlockedError);
    expect((error as BlockedError).code).toBe('headless_blocked');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks values on the block list', async () => {
    const { fetch } = mockFetch(accepted());
    const client = createClient({ fetch, blockList: { list: ['spam@x.com'], watchVariable: 'email' } });
    const { error } = await settle(client.send('s', 't', { email: ' SPAM@x.com ' }));
    expect((error as BlockedError).code).toBe('recipient_blocked');
    const ok = await settle(client.send('s', 't', { email: 'ok@x.com' }));
    expect(ok.value?.status).toBe('queued');
  });

  it('throttles with limitRate after a successful send only', async () => {
    const { fetch } = mockFetch(apiError(500, 'internal_error'), accepted());
    const client = createClient({ fetch, retry: false, limitRate: { id: 'contact', throttle: 10000 } });
    expect((await settle(client.send('s', 't'))).error).toBeInstanceOf(FrontmailError);
    expect((await settle(client.send('s', 't'))).value?.status).toBe('queued');
    const blocked = await settle(client.send('s', 't'));
    expect(blocked.error).toBeInstanceOf(BlockedError);
    expect((blocked.error as BlockedError).code).toBe('rate_limited');
    vi.setSystemTime(Date.now() + 10001);
    expect((await settle(client.send('s', 't'))).value?.status).toBe('queued');
  });

  it('per-call options override client options', async () => {
    const { fetch } = mockFetch(accepted());
    const client = createClient({ fetch, blockList: { list: ['a'], watchVariable: 'x' } });
    const { value } = await settle(client.send('s', 't', { x: 'a' }, { blockList: { list: [] } }));
    expect(value?.status).toBe('queued');
  });
});

describe('sendForm', () => {
  it('posts multipart form data with reserved fields and files', async () => {
    document.body.innerHTML = `
      <form id="f">
        <input name="name" value="Jan">
        <input name="cf-turnstile-response" value="tok">
        <input type="file" name="empty">
      </form>`;
    const form = document.querySelector('form')!;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.name = 'cv';
    const file = new File(['hello'], 'cv.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    form.appendChild(fileInput);

    const { fetch, calls } = mockFetch(accepted());
    const { value } = await settle(createClient({ fetch, publicKey: 'pk' }).sendForm('svc', 'tpl', '#f'));
    expect(value?.messageId).toBe('msg_1');
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/send-form');
    const fd = calls[0]!.init.body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(calls[0]!.init.headers['Content-Type']).toBeUndefined();
    expect(fd.get('service_id')).toBe('svc');
    expect(fd.get('template_id')).toBe('tpl');
    expect(fd.get('user_id')).toBe('pk');
    expect(fd.get('name')).toBe('Jan');
    expect(fd.get('cf-turnstile-response')).toBe('tok');
    expect(fd.has('empty')).toBe(false);
    expect(calls[0]!.init.headers['Idempotency-Key']).toBeTruthy();
  });

  it('adds the turnstile_key form field only when set', async () => {
    document.body.innerHTML = `<form><input name="a" value="1"></form>`;
    const { fetch, calls } = mockFetch(accepted());
    const client = createClient({ fetch, publicKey: 'pk' });
    await settle(client.sendForm('s', 't', document.forms[0]!, { turnstileToken: 'tok', turnstileKey: 'frontmail' }));
    await settle(client.sendForm('s', 't', document.forms[0]!));
    const [a, b] = calls.map((c) => c.init.body as FormData);
    expect(a!.get('cf-turnstile-response')).toBe('tok');
    expect(a!.get('turnstile_key')).toBe('frontmail');
    expect(b!.has('turnstile_key')).toBe(false);
  });

  it('applies the block list to form fields', async () => {
    document.body.innerHTML = `<form><input name="email" value="bad@x.com"></form>`;
    const { fetch } = mockFetch(accepted());
    const { error } = await settle(
      createClient({ fetch }).sendForm('s', 't', document.forms[0]!, { blockList: { list: ['bad@x.com'], watchVariable: 'email' } }),
    );
    expect(error).toBeInstanceOf(BlockedError);
  });

  it('throws for a missing form', async () => {
    const { fetch } = mockFetch(accepted());
    const { error } = await settle(createClient({ fetch }).sendForm('s', 't', '#missing'));
    expect((error as FrontmailError).code).toBe('bad_request');
  });

  it('uses custom paths', async () => {
    document.body.innerHTML = `<form><input name="a" value="1"></form>`;
    const { fetch, calls } = mockFetch(accepted());
    const client = createClient({ fetch, paths: { send: '/api/v1.0/email/send', sendForm: '/api/v1.0/email/send-form' } });
    await settle(client.sendForm('s', 't', document.forms[0]!));
    await settle(client.send('s', 't'));
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/api/v1.0/email/send-form', '/api/v1.0/email/send']);
  });
});

describe('getStatus / request', () => {
  it('passes the status token and camelizes the response', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { message_id: 'msg_1', status: 'sent', created_at: 'x', events: [{ type: 'accepted', at: 'y' }] }),
    );
    const { value } = await settle(createClient({ fetch, publicKey: 'pk' }).getStatus('msg_1', { token: 'tok' }));
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/messages/msg_1?token=tok');
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.headers['X-Frontmail-Public-Key']).toBe('pk');
    expect(value).toEqual({ messageId: 'msg_1', status: 'sent', createdAt: 'x', events: [{ type: 'accepted', at: 'y' }] });
  });

  it('drops null query params', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, {}));
    await settle(createClient({ fetch }).request('/v1/history', { query: { limit: 10, cursor: undefined, status: null } }));
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/history?limit=10');
  });

  it('works in a React Native-like runtime (no URLSearchParams, FormData, crypto, document)', async () => {
    vi.stubGlobal('URLSearchParams', undefined);
    vi.stubGlobal('FormData', undefined);
    vi.stubGlobal('crypto', undefined);
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('localStorage', undefined);
    try {
      const { fetch, calls } = mockFetch(jsonResponse(200, { message_id: 'm', status: 'sent', events: [] }), accepted());
      const client = createClient({ fetch, publicKey: 'pk', limitRate: { throttle: 1000 } });
      await settle(client.getStatus('m', { token: 'a b&c' }));
      expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/messages/m?token=a%20b%26c');
      const { value, error } = await settle(client.send('svc', 'tpl', { name: 'Jan' }));
      expect(error).toBeUndefined();
      expect(value?.status).toBe('queued');
      expect(calls[1]!.init.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(JSON.parse(calls[1]!.init.body as string)).toMatchObject({ template_id: 'tpl', template_params: { name: 'Jan' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
