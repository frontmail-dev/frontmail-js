import { FrontmailError } from './errors';
import { TURNSTILE_FIELD } from './form';

export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (code?: string) => void;
  'expired-callback'?: () => void;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'flexible' | 'compact' | 'invisible';
  appearance?: 'always' | 'execute' | 'interaction-only';
  action?: string;
  [key: string]: unknown;
}

/** Subset of the `window.turnstile` API used by the SDKs. */
export interface TurnstileApi {
  render(container: HTMLElement | string, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
  getResponse(widgetId?: string): string | undefined;
}

type TurnstileGlobal = { turnstile?: TurnstileApi };

let loading: Promise<TurnstileApi> | undefined;

/** Lazily injects the Turnstile script (once) and resolves with `window.turnstile`. */
export function loadTurnstile(src: string = TURNSTILE_SCRIPT_URL): Promise<TurnstileApi> {
  const g = globalThis as TurnstileGlobal;
  if (g.turnstile) return Promise.resolve(g.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const doc = globalThis.document;
    if (!doc) return reject(new FrontmailError('captcha_required', 'Turnstile needs a browser environment.'));
    const script = doc.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      g.turnstile ? resolve(g.turnstile) : reject(new FrontmailError('captcha_failed', 'Turnstile failed to initialise.'));
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new FrontmailError('captcha_failed', 'Failed to load the Turnstile script.'));
    };
    doc.head.appendChild(script);
  });
  return loading;
}

/**
 * Renders a Turnstile widget into `container` (loading the script on demand).
 * Inside a `<form>` the widget adds a hidden `cf-turnstile-response` input that `sendForm` submits.
 */
export async function renderTurnstile(
  container: HTMLElement,
  options: TurnstileRenderOptions,
): Promise<{ widgetId: string | undefined; api: TurnstileApi }> {
  const api = await loadTurnstile();
  return { widgetId: api.render(container, options), api };
}

/**
 * Returns a Turnstile token.
 * - `HTMLElement` (form or widget container): reads the rendered widget's `cf-turnstile-response`.
 * - `string` site key: renders an invisible widget off-screen and waits for the token.
 */
export async function getTurnstileToken(source: string | HTMLElement, timeoutMs = 30000): Promise<string> {
  if (typeof source != 'string') {
    const input = source.querySelector<HTMLInputElement>('input[name="' + TURNSTILE_FIELD + '"]');
    const token = input?.value || (globalThis as TurnstileGlobal).turnstile?.getResponse();
    if (!token) throw new FrontmailError('captcha_required', 'Turnstile has not produced a token yet.');
    return token;
  }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(el);
  let api: TurnstileApi | undefined;
  let widgetId: string | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new FrontmailError('captcha_failed', 'Turnstile timed out.')), timeoutMs);
      const done = (fn: () => void) => {
        clearTimeout(timer);
        fn();
      };
      renderTurnstile(el, {
        sitekey: source,
        size: 'invisible',
        callback: (t) => done(() => resolve(t)),
        'error-callback': (c) => done(() => reject(new FrontmailError('captcha_failed', 'Turnstile error ' + (c ?? '')))),
      }).then((r) => ((api = r.api), (widgetId = r.widgetId)), (e: unknown) => done(() => reject(e)));
    });
  } finally {
    api?.remove(widgetId);
    el.remove();
  }
}

/** Test helper: forget the cached loader promise. */
export function _resetTurnstileLoader(): void {
  loading = undefined;
}
