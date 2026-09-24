import type { FrontmailError, SendOptions, SendResult, TemplateParams } from '@frontmail/sdk-core';
import { isFrontmailError, FrontmailError as FrontmailErrorClass } from '@frontmail/sdk-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrontmail } from './context';

/** `sent` = accepted by the API and queued for delivery; `held` = accepted and waiting for credits. */
export type SendStatus = 'idle' | 'sending' | 'sent' | 'held' | 'error';

export interface SendState {
  status: SendStatus;
  error: FrontmailError | null;
  result: SendResult | null;
}

export interface UseSendEmail<T extends string> extends SendState {
  /** Sends the template. Resolves with the result, or `undefined` on error (see `error`). */
  send(params: TemplateParams<T>, options?: SendOptions): Promise<SendResult | undefined>;
  /** Sends a form element (multipart, files become attachments). */
  sendForm(form: HTMLFormElement | string, options?: SendOptions): Promise<SendResult | undefined>;
  reset(): void;
}

const IDLE: SendState = { status: 'idle', error: null, result: null };

export function toFrontmailError(e: unknown): FrontmailError {
  return isFrontmailError(e) ? e : new FrontmailErrorClass('internal_error', e instanceof Error ? e.message : String(e), { cause: e });
}

/** Sends emails with reactive status: `idle → sending → sent | held | error`. */
export function useSendEmail<T extends string>(serviceId: string | null | undefined, templateId: T): UseSendEmail<T> {
  const client = useFrontmail();
  const [state, setState] = useState<SendState>(IDLE);
  const callId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<SendResult>) => {
    const id = ++callId.current;
    const update = (s: SendState) => mounted.current && id === callId.current && setState(s);
    update({ status: 'sending', error: null, result: null });
    try {
      const result = await fn();
      update({ status: result.status === 'held' ? 'held' : 'sent', error: null, result });
      return result;
    } catch (e) {
      update({ status: 'error', error: toFrontmailError(e), result: null });
      return undefined;
    }
  }, []);

  const send = useCallback(
    (params: TemplateParams<T>, options?: SendOptions) => run(() => client.send(serviceId, templateId, params, options)),
    [client, serviceId, templateId, run],
  );
  const sendForm = useCallback(
    (form: HTMLFormElement | string, options?: SendOptions) => run(() => client.sendForm(serviceId, templateId, form, options)),
    [client, serviceId, templateId, run],
  );
  const reset = useCallback(() => {
    callId.current++;
    setState(IDLE);
  }, []);

  return { ...state, send, sendForm, reset };
}
