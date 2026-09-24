import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import frontmail, { FrontmailError, getStatus, init, send, sendForm } from '../src';
import { accepted, jsonResponse, mockFetch } from './helpers';
import pkg from '../package.json';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('@frontmail/browser', () => {
  it('has the EmailJS-like surface', () => {
    expect(Object.keys(frontmail).sort()).toEqual(['FrontmailError', 'getStatus', 'init', 'send', 'sendForm']);
    expect(frontmail.send).toBe(send);
  });

  it('requires init or a per-call public key', async () => {
    const mod = await import('../src');
    await expect(mod.send('s', 't')).rejects.toMatchObject({ code: 'not_initialized' });
    await expect(mod.send('s', 't')).rejects.toBeInstanceOf(mod.FrontmailError);
  });

  it('sends with a per-call public key (EmailJS style string option)', async () => {
    const { fetch, calls } = mockFetch(accepted());
    vi.stubGlobal('fetch', fetch);
    const mod = await import('../src');
    const res = await mod.send('svc', 'tpl', { a: 1 }, 'pk_call');
    expect(res).toEqual({ messageId: 'msg_1', status: 'queued', statusToken: 'tok_1', status_code: 202, text: 'OK' });
    expect(JSON.parse(calls[0]!.init.body as string).user_id).toBe('pk_call');
  });

  it('init → send / sendForm / getStatus', async () => {
    const { fetch, calls } = mockFetch(accepted('held'), accepted(), jsonResponse(200, { message_id: 'msg_1', status: 'sent', events: [] }));
    init({ publicKey: 'pk_1', apiUrl: 'http://localhost:3000', fetch });
    const r1 = await send('svc', 'tpl', { name: 'x' });
    expect(r1.status).toBe('held');
    expect(calls[0]!.url).toBe('http://localhost:3000/v1/send');
    expect(calls[0]!.init.headers['X-Frontmail-Client']).toBe('@frontmail/browser/' + pkg.version);

    document.body.innerHTML = '<form id="c"><input name="message" value="hi"></form>';
    await sendForm('svc', 'tpl', '#c');
    expect(calls[1]!.url).toBe('http://localhost:3000/v1/send-form');
    expect((calls[1]!.init.body as FormData).get('message')).toBe('hi');

    const status = await getStatus('msg_1', { token: r1.statusToken });
    expect(status.status).toBe('sent');
    expect(calls[2]!.url).toBe('http://localhost:3000/v1/messages/msg_1?token=tok_1');
  });

  it('init accepts a public key string', async () => {
    const { fetch, calls } = mockFetch(accepted());
    vi.stubGlobal('fetch', fetch);
    init('pk_str');
    await send('s', 't');
    expect(calls[0]!.init.headers['X-Frontmail-Public-Key']).toBe('pk_str');
  });

  it('exports typed error classes', () => {
    expect(new FrontmailError('bad_request', 'x')).toBeInstanceOf(Error);
  });
});

describe('UMD bundle', () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), '../dist/frontmail.umd.js');
  // Requires `pnpm build` first (turbo runs build before test).
  it.skipIf(!existsSync(file))('exposes window.frontmail', () => {
    const code = readFileSync(file, 'utf8');
    const g = {} as { frontmail?: Record<string, unknown> };
    new Function('self', 'globalThis', 'exports', 'module', 'define', code).call(g, g, g, undefined, undefined, undefined);
    expect(Object.keys(g.frontmail!).sort()).toEqual(
      ['AuthError', 'BlockedError', 'FrontmailError', 'InsufficientCreditsError', 'NetworkError', 'RateLimitError', 'ValidationError', 'getStatus', 'init', 'send', 'sendForm'].sort(),
    );
  });
});
