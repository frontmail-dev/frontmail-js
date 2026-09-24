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

/** `FormData` of a form without empty file inputs. */
export function formData(form: HTMLFormElement): FormData {
  const fd = new FormData(form);
  const out = new FormData();
  fd.forEach((v, k) => {
    if (!isEmptyFile(v)) out.append(k, v);
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

/** Collects text fields and files of a form (or selector). */
export function formToParams(form: HTMLFormElement | string): FormParams {
  const result: FormParams = { params: {}, files: [] };
  formData(resolveForm(form)).forEach((v, k) => {
    if (typeof v != 'string') return void result.files.push({ name: k, file: v });
    if (k == TURNSTILE_FIELD || k == 'turnstile_token') return void (result.turnstileToken = v);
    const prev = result.params[k];
    result.params[k] = prev === undefined ? v : ([] as string[]).concat(prev, v);
  });
  return result;
}
