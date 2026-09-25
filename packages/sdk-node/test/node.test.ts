import { describe, expect, it, vi } from 'vitest';
import { Frontmail, InsufficientCreditsError, ValidationError } from '../src';
import { accepted, apiError, jsonResponse, mockFetch } from './helpers';

describe('Frontmail (node)', () => {
  it('refuses to run in a browser unless explicitly allowed', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vi.resetModules();
      const mod = await import('../src');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('server-side SDK'));
      expect(() => new mod.Frontmail({ privateKey: 'sk_1' })).toThrowError(expect.objectContaining({ code: 'private_key_in_browser' }));
      expect(() => new mod.Frontmail({ privateKey: 'sk_1', dangerouslyAllowPrivateKeyInBrowser: true })).not.toThrow();
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('requires a private key (option or env)', () => {
    vi.stubEnv('FRONTMAIL_PRIVATE_KEY', '');
    expect(() => new Frontmail()).toThrow(/FRONTMAIL_PRIVATE_KEY/);
    vi.stubEnv('FRONTMAIL_PRIVATE_KEY', 'sk_env');
    vi.stubEnv('FRONTMAIL_API_URL', 'http://localhost:9999');
    const fm = new Frontmail();
    expect(fm.client.options.privateKey).toBe('sk_env');
    expect(fm.client.options.apiUrl).toBe('http://localhost:9999');
    vi.unstubAllEnvs();
  });

  it('send uses Bearer auth, idempotency key and the node client name', async () => {
    const { fetch, calls } = mockFetch(accepted());
    const fm = new Frontmail({ privateKey: 'sk_1', fetch });
    const res = await fm.send({ serviceId: 'svc', templateId: 'tpl', params: { a: 1 } });
    expect(res).toEqual({ messageId: 'msg_1', status: 'queued', statusToken: 'tok_1', status_code: 202, text: 'OK' });
    const { url, init } = calls[0]!;
    expect(url).toBe('https://api.frontmail.dev/v1/send');
    expect(init.headers.Authorization).toBe('Bearer sk_1');
    expect(init.headers['Idempotency-Key']).toBeTruthy();
    expect(init.headers['X-Frontmail-Client']).toMatch(/^@frontmail\/node\//);
    expect(JSON.parse(init.body as string)).toEqual({ service_id: 'svc', template_id: 'tpl', template_params: { a: 1 } });
  });

  it('send throws typed errors', async () => {
    const { fetch } = mockFetch(apiError(402, 'insufficient_credits'));
    await expect(new Frontmail({ privateKey: 'sk', fetch }).send({ templateId: 't' })).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it('sendBatch maps per-item results and errors', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, {
        results: [
          { index: 0, message_id: 'msg_a', status: 'queued' },
          { index: 1, error: { code: 'invalid_template_params', message: 'bad', docs_url: 'https://d' } },
          { index: 2, message_id: 'msg_c', status: 'held' },
        ],
      }),
    );
    const fm = new Frontmail({ privateKey: 'sk', fetch });
    const results = await fm.sendBatch([
      { templateId: 't', params: { n: 1 }, idempotencyKey: 'k0' },
      { templateId: 't' },
      { templateId: 't', serviceId: 's' },
    ]);
    expect(results[0]).toEqual({ index: 0, ok: true, messageId: 'msg_a', status: 'queued' });
    expect(results[2]).toEqual({ index: 2, ok: true, messageId: 'msg_c', status: 'held' });
    expect(results[1]).toMatchObject({ index: 1, ok: false });
    const err = (results[1] as { error: ValidationError }).error;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ code: 'invalid_template_params', status: 422, docsUrl: 'https://d' });
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/send-batch');
    expect(body.messages).toHaveLength(3);
    expect(body.messages[0].idempotency_key).toBe('k0');
    expect(body.messages[1].idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sendBatch validates the size', async () => {
    const { fetch } = mockFetch(accepted());
    const fm = new Frontmail({ privateKey: 'sk', fetch });
    await expect(fm.sendBatch(Array.from({ length: 101 }, () => ({ templateId: 't' })))).rejects.toBeInstanceOf(ValidationError);
    await expect(fm.sendBatch([])).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('history: await one page or iterate all pages', async () => {
    const page = (ids: string[], next: string | null) =>
      jsonResponse(200, {
        items: ids.map((id) => ({ message_id: id, status: 'sent', template_id: 't', service_id: 's', to: ['a@b.cz'], created_at: 'x' })),
        next_cursor: next,
      });
    const { fetch, calls } = mockFetch(page(['m1', 'm2'], 'c2'), page(['m3'], null));
    const fm = new Frontmail({ privateKey: 'sk', fetch });
    const first = await fm.history({ limit: 2, templateId: 't', status: 'sent' });
    expect(first.items.map((i) => i.messageId)).toEqual(['m1', 'm2']);
    expect(first.nextCursor).toBe('c2');
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/history?limit=2&status=sent&template_id=t');

    calls.length = 0;
    const { fetch: f2, calls: c2 } = mockFetch(page(['m1', 'm2'], 'c2'), page(['m3'], null));
    const all: string[] = [];
    for await (const item of new Frontmail({ privateKey: 'sk', fetch: f2 }).history({ limit: 2 })) all.push(item.messageId);
    expect(all).toEqual(['m1', 'm2', 'm3']);
    expect(c2[1]!.url).toContain('cursor=c2');
  });

  it('getMessage and templates', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { message_id: 'm', status: 'delivered', created_at: 'x', events: [] }),
      jsonResponse(200, { items: [{ template_id: 'tpl_1', name: 'Contact', params: [{ name: 'a', type: 'string', required: true }] }] }),
      jsonResponse(200, { template_id: 'tpl_1', name: 'Contact' }),
    );
    const fm = new Frontmail({ privateKey: 'sk', fetch });
    await expect(fm.getMessage('m')).resolves.toMatchObject({ messageId: 'm', status: 'delivered' });
    expect(calls[0]!.url).toBe('https://api.frontmail.dev/v1/messages/m');
    await expect(fm.templates.list()).resolves.toEqual([
      { templateId: 'tpl_1', name: 'Contact', params: [{ name: 'a', type: 'string', required: true }] },
    ]);
    await expect(fm.templates.get('tpl_1')).resolves.toEqual({ templateId: 'tpl_1', name: 'Contact', params: [] });
  });
});
