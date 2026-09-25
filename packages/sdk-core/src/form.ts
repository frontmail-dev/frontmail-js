import { FrontmailError } from './errors';

export const TURNSTILE_FIELD = 'cf-turnstile-response';

/** Resolves a form element or CSS selector. */
export function resolveForm(form: HTMLFormElement | string): HTMLFormElement {
  const el = typeof form == 'string' ? globalThis.document?.querySelector(form) : form;
  if (!el || (el as Element).tagName != 'FORM') {
    throw new FrontmailError('bad_request', 'Form not found: ' + String(form));
  }
  return el as HTMLFormElement;
}

const isEmptyFile = (v: FormDataEntryValue) => typeof v != 'string' && !v.name && !v.size;

/**
 * Hidden anti-CSRF fields of common web frameworks (Django `csrfmiddlewaretoken`, Laravel `_token`,
 * Rails `authenticity_token`, ASP.NET `__RequestVerificationToken`, Express/Symfony/Flask `_csrf`,
 * `csrf_token`). They are session secrets of your site and are never sent unless listed in `include`.
 */
export const CSRF_FIELD = /^(csrfmiddlewaretoken|_token|authenticity_token|__RequestVerificationToken|_?csrf(_token)?)$/;

/**
 * Names the API treats as credentials or control fields (`accessToken`, `access_token`,
 * `privateKey`, `private_key`, `turnstile_key`, `template_params`). A form field with one of these
 * names is always dropped – it could otherwise switch the key or the CAPTCHA secret.
 */
export const RESERVED_FIELD = /^(access_?token|private_?key|turnstile_key|template_params)$/i;

/** Which fields of a form are sent by `sendForm` / collected by `formToParams`. */
export interface FormFieldOptions {
  /**
   * Allowlist of field names. When set, only these fields (plus the Turnstile token) are sent.
   * Naming a password or CSRF field here sends it anyway.
   */
  include?: string[];
  /** Field names that are never sent (in addition to the defaults). */
  exclude?: string[];
}

/**
 * `FormData` of a form without empty file inputs, password inputs, CSRF tokens and reserved API
 * field names (see `FormFieldOptions`).
 */
export function formData(form: HTMLFormElement, options: FormFieldOptions = {}): FormData {
  const include = options.include && new Set(options.include);
  const exclude = new Set(options.exclude);
  const passwords = new Set<string>();
  for (const el of Array.from(form.elements)) if ((el as HTMLInputElement).type == 'password') passwords.add((el as HTMLInputElement).name);
  const fd = new FormData(form);
  const out = new FormData();
  fd.forEach((v, k) => {
    if (isEmptyFile(v) || RESERVED_FIELD.test(k) || exclude.has(k)) return;
    const turnstile = k == TURNSTILE_FIELD || k == 'turnstile_token';
    if (include ? !include.has(k) && !turnstile : passwords.has(k) || CSRF_FIELD.test(k)) return;
    out.append(k, v);
  });
  return out;
}

export interface FormParams {
  /** Text fields; repeated names (checkbox groups, multi-selects) become arrays. */
  params: Record<string, string | string[]>;
  /** Non-empty file inputs. */
  files: { name: string; file: File }[];
  /** Value of the Turnstile widget's hidden `cf-turnstile-response` input, if any. */
  turnstileToken?: string;
}

/** Collects text fields and files of a form (or selector), filtered like `sendForm`. */
export function formToParams(form: HTMLFormElement | string, options?: FormFieldOptions): FormParams {
  const result: FormParams = { params: {}, files: [] };
  formData(resolveForm(form), options).forEach((v, k) => {
    if (typeof v != 'string') return void result.files.push({ name: k, file: v });
    if (k == TURNSTILE_FIELD || k == 'turnstile_token') return void (result.turnstileToken = v);
    const prev = result.params[k];
    result.params[k] = prev === undefined ? v : ([] as string[]).concat(prev, v);
  });
  return result;
}
