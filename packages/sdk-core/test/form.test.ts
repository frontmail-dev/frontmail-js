import { describe, expect, it, vi } from 'vitest';
import { FrontmailError, createClient, formToParams } from '../src';
import { accepted, mockFetch } from './helpers';

describe('formToParams', () => {
  it('collects text fields, repeated fields, files and the Turnstile token', () => {
    document.body.innerHTML = `
      <form id="contact">
        <input name="name" value="Jan">
        <textarea name="message">Hi</textarea>
        <select name="topic"><option value="sales" selected>Sales</option></select>
        <input type="checkbox" name="tags" value="a" checked>
        <input type="checkbox" name="tags" value="b" checked>
        <input type="checkbox" name="tags" value="c">
        <input type="hidden" name="cf-turnstile-response" value="tok">
        <input type="file" name="empty">
        <input name="disabled" value="x" disabled>
      </form>`;
    // jsdom cannot populate file inputs, so inject the file through FormData.
    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' });
    const Orig = FormData;
    vi.stubGlobal(
      'FormData',
      class extends Orig {
        constructor(f?: HTMLFormElement) {
          super(f);
          if (f) this.append('cv', file);
        }
      },
    );
    const result = formToParams('#contact');
    vi.unstubAllGlobals();
    expect(result.params).toEqual({ name: 'Jan', message: 'Hi', topic: 'sales', tags: ['a', 'b'] });
    expect(result.turnstileToken).toBe('tok');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.name).toBe('cv');
    expect(result.files[0]!.file.name).toBe('cv.pdf');
  });

  it('throws for non-forms', () => {
    document.body.innerHTML = `<div id="x"></div>`;
    expect(() => formToParams('#x')).toThrow(FrontmailError);
    expect(() => formToParams('#nope')).toThrow(/Form not found/);
  });
});

describe('form field filtering (SDK-07)', () => {
  const html = `
    <form id="f">
      <input name="email" value="a@b.cz">
      <input type="password" name="pwd" value="secret">
      <input type="hidden" name="csrfmiddlewaretoken" value="dj">
      <input type="hidden" name="_token" value="lv">
      <input type="hidden" name="authenticity_token" value="rails">
      <input type="hidden" name="__RequestVerificationToken" value="net">
      <input type="hidden" name="_csrf" value="ex">
      <input type="hidden" name="csrf_token" value="fl">
      <input type="hidden" name="accessToken" value="sk_evil">
      <input type="hidden" name="privateKey" value="sk_evil">
      <input type="hidden" name="turnstile_key" value="frontmail">
      <input type="hidden" name="cf-turnstile-response" value="tok">
      <input name="note" value="n">
    </form>`;

  it('skips passwords, CSRF tokens and reserved names by default', () => {
    document.body.innerHTML = html;
    const r = formToParams('#f');
    expect(r.params).toEqual({ email: 'a@b.cz', note: 'n' });
    expect(r.turnstileToken).toBe('tok');
  });

  it('supports include (allowlist) and exclude', () => {
    document.body.innerHTML = html;
    expect(formToParams('#f', { include: ['email', 'pwd', 'accessToken'] })).toMatchObject({
      params: { email: 'a@b.cz', pwd: 'secret' },
      turnstileToken: 'tok',
    });
    expect(formToParams('#f', { exclude: ['note'] }).params).toEqual({ email: 'a@b.cz' });
  });

  it('sendForm applies the filter and the formFields option', async () => {
    document.body.innerHTML = html;
    const { fetch, calls } = mockFetch(accepted());
    const client = createClient({ publicKey: 'pk_1', fetch });
    await client.sendForm('svc', 'tpl', '#f', { formFields: { exclude: ['note'] } });
    const fd = calls[0]!.init.body as FormData;
    expect([...new Set(fd.keys())].sort()).toEqual(['cf-turnstile-response', 'email', 'service_id', 'template_id', 'user_id']);
    expect(calls[0]!.init.headers.Authorization).toBeUndefined();
  });
});
