import { renderTurnstile } from '@frontmail/sdk-core';
import type { FrontmailError, SendOptions, SendResult, TurnstileApi, TurnstileRenderOptions } from '@frontmail/sdk-core';
import { useEffect, useRef } from 'react';
import type { FormEvent, FormHTMLAttributes, ReactNode } from 'react';
import { useSendEmail } from './useSendEmail';
import type { SendState } from './useSendEmail';

export interface FrontmailFormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'onError' | 'children'> {
  serviceId?: string | null;
  templateId: string;
  /** Renders a Cloudflare Turnstile widget (script loaded lazily); its token is submitted automatically. */
  turnstileSiteKey?: string;
  turnstileOptions?: Omit<TurnstileRenderOptions, 'sitekey'>;
  /** Per-send options (guards, idempotency key…). */
  sendOptions?: SendOptions;
  /** Reset the form fields after a successful send. Default `true`. */
  resetOnSuccess?: boolean;
  onSuccess?: (result: SendResult) => void;
  onError?: (error: FrontmailError) => void;
  children?: ReactNode | ((state: SendState) => ReactNode);
}

/** A `<form>` that submits its fields (and files) via `sendForm`, with optional Turnstile. */
export function FrontmailForm({
  serviceId,
  templateId,
  turnstileSiteKey,
  turnstileOptions,
  sendOptions,
  resetOnSuccess = true,
  onSuccess,
  onError,
  children,
  ...rest
}: FrontmailFormProps) {
  const { sendForm, ...state } = useSendEmail(serviceId, templateId);
  const formRef = useRef<HTMLFormElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const turnstile = useRef<{ api: TurnstileApi; widgetId: string | undefined } | null>(null);
  const turnstileOptionsRef = useRef(turnstileOptions);
  turnstileOptionsRef.current = turnstileOptions;

  useEffect(() => {
    const el = widgetRef.current;
    if (!turnstileSiteKey || !el) return;
    let cancelled = false;
    renderTurnstile(el, { ...turnstileOptionsRef.current, sitekey: turnstileSiteKey }).then(
      (r) => {
        if (cancelled) r.api.remove(r.widgetId);
        else turnstile.current = r;
      },
      (e: unknown) => onError?.(e as FrontmailError),
    );
    return () => {
      cancelled = true;
      turnstile.current?.api.remove(turnstile.current.widgetId);
      turnstile.current = null;
    };
    // onError intentionally not a dependency – re-rendering the widget on every render would reset it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnstileSiteKey]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const result = await sendForm(form, sendOptions);
    // Turnstile tokens are single-use.
    turnstile.current?.api.reset(turnstile.current.widgetId);
    if (result) {
      if (resetOnSuccess) form.reset();
      onSuccess?.(result);
    }
  }

  // Report errors after the state update so `state.error` is the normalized FrontmailError.
  const lastError = useRef<FrontmailError | null>(null);
  useEffect(() => {
    if (state.error && state.error !== lastError.current) onError?.(state.error);
    lastError.current = state.error;
  }, [state.error, onError]);

  return (
    <form {...rest} ref={formRef} onSubmit={handleSubmit} data-status={state.status} aria-busy={state.status === 'sending'}>
      {typeof children === 'function' ? children(state) : children}
      {turnstileSiteKey ? <div ref={widgetRef} className="frontmail-turnstile" /> : null}
    </form>
  );
}
