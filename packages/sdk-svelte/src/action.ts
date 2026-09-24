import { FrontmailError, renderTurnstile } from '@frontmail/sdk-core';
import type { SendOptions, SendResult, TurnstileApi, TurnstileRenderOptions } from '@frontmail/sdk-core';
import { getDefaultFrontmail, trackSend } from './frontmail.js';
import type { FrontmailInstance, SendState } from './frontmail.js';

export interface FrontmailFormParams {
  serviceId?: string | null;
  templateId: string;
  /** Instance to use; defaults to the first one created with `createFrontmail`. */
  frontmail?: FrontmailInstance;
  /** Renders a Turnstile widget at the end of the form (script loaded lazily). */
  turnstileSiteKey?: string;
  turnstileOptions?: Omit<TurnstileRenderOptions, 'sitekey'>;
  sendOptions?: SendOptions;
  /** Reset the form after a successful send. Default `true`. */
  resetOnSuccess?: boolean;
  onSuccess?: (result: SendResult) => void;
  onError?: (error: FrontmailError) => void;
  /** Called on every state change (`sending`, `sent`, `held`, `error`). */
  onState?: (state: SendState) => void;
}

/**
 * Svelte action: `<form use:frontmailForm={{ serviceId, templateId, onSuccess }}>`.
 * Submits the form via `sendForm` and mirrors the status in `data-status`.
 */
export function frontmailForm(node: HTMLFormElement, params: FrontmailFormParams) {
  let p = params;
  let turnstile: { api: TurnstileApi; widgetId: string | undefined } | null = null;
  let widget: HTMLDivElement | null = null;
  let destroyed = false;
  let siteKey: string | undefined;

  const mountTurnstile = async () => {
    if (p.turnstileSiteKey === siteKey) return;
    unmountTurnstile();
    siteKey = p.turnstileSiteKey;
    if (!siteKey) return;
    const el = (widget = document.createElement('div'));
    el.className = 'frontmail-turnstile';
    node.appendChild(el);
    try {
      const r = await renderTurnstile(el, { ...p.turnstileOptions, sitekey: siteKey });
      if (destroyed || widget !== el) r.api.remove(r.widgetId);
      else turnstile = r;
    } catch (e) {
      p.onError?.(e as FrontmailError);
    }
  };
  const unmountTurnstile = () => {
    turnstile?.api.remove(turnstile.widgetId);
    turnstile = null;
    widget?.remove();
    widget = null;
  };

  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const fm = p.frontmail ?? getDefaultFrontmail();
    const onState = (s: SendState) => {
      node.dataset.status = s.status;
      p.onState?.(s);
      if (s.error) p.onError?.(s.error);
    };
    const result = fm
      ? await fm.track(() => fm.client.sendForm(p.serviceId, p.templateId, node, p.sendOptions), onState)
      : await trackSend(() => Promise.reject(new FrontmailError('not_initialized', 'Call createFrontmail({ publicKey }) first.')), onState);
    turnstile?.api.reset(turnstile.widgetId);
    if (result) {
      if (p.resetOnSuccess !== false) node.reset();
      p.onSuccess?.(result);
    }
  };

  node.dataset.status = 'idle';
  node.addEventListener('submit', onSubmit);
  void mountTurnstile();

  return {
    update(next: FrontmailFormParams) {
      p = next;
      void mountTurnstile();
    },
    destroy() {
      destroyed = true;
      node.removeEventListener('submit', onSubmit);
      unmountTurnstile();
    },
  };
}
