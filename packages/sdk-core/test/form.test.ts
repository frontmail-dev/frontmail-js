import { describe, expect, it, vi } from 'vitest';
import { FrontmailError, formToParams } from '../src';

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
