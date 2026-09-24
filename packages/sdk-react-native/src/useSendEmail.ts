import type { FrontmailError, MessageStatusResponse, SendOptions, SendResult, TemplateParams } from '@frontmail/sdk-core';
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
  /**
   * Sends the template. Pass `{ turnstileToken }` from `<TurnstileWebView>` when the template requires
   * Turnstile. Resolves with the result, or `undefined` on error (see `error`) – it never rejects.
   */
  send(params: TemplateParams<T>, options?: SendOptions): Promise<SendResult | undefined>;
  /** Delivery status of the last accepted message (uses its status token). */
  getStatus(options?: { signal?: AbortSignal }): Promise<MessageStatusResponse>;
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
  const last = useRef<SendResult | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (params: TemplateParams<T>, options?: SendOptions) => {
      const id = ++callId.current;
      const update = (s: SendState) => mounted.current && id === callId.current && setState(s);
      update({ status: 'sending', error: null, result: null });
      try {
        const result = await client.send(serviceId, templateId, params, options);
        last.current = result;
        update({ status: result.status === 'held' ? 'held' : 'sent', error: null, result });
        return result;
      } catch (e) {
        update({ status: 'error', error: toFrontmailError(e), result: null });
        return undefined;
      }
    },
    [client, serviceId, templateId],
  );
  const getStatus = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      const r = last.current;
      if (!r) throw new FrontmailErrorClass('not_initialized', 'Nothing has been sent yet.');
      return client.getStatus(r.messageId, { token: r.statusToken, signal: options?.signal });
    },
    [client],
  );
  const reset = useCallback(() => {
    callId.current++;
    last.current = null;
    setState(IDLE);
  }, []);

  return { ...state, send, getStatus, reset };
}
