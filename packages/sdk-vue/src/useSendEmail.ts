import { FrontmailError, isFrontmailError } from '@frontmail/sdk-core';
import type { SendOptions, SendResult, TemplateParams } from '@frontmail/sdk-core';
import { readonly, ref, shallowRef, toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { useFrontmail } from './plugin';

/** `sent` = accepted by the API and queued for delivery; `held` = accepted and waiting for credits. */
export type SendStatus = 'idle' | 'sending' | 'sent' | 'held' | 'error';

export interface UseSendEmail<T extends string> {
  status: Readonly<Ref<SendStatus>>;
  error: Readonly<Ref<FrontmailError | null>>;
  result: Readonly<Ref<SendResult | null>>;
  /** Resolves with the result, or `undefined` on error (see `error`). */
  send(params: TemplateParams<T>, options?: SendOptions): Promise<SendResult | undefined>;
  sendForm(form: HTMLFormElement | string, options?: SendOptions): Promise<SendResult | undefined>;
  reset(): void;
}

export function toFrontmailError(e: unknown): FrontmailError {
  return isFrontmailError(e) ? e : new FrontmailError('internal_error', e instanceof Error ? e.message : String(e), { cause: e });
}

/** Composable with reactive status: `idle → sending → sent | held | error`. */
export function useSendEmail<T extends string>(
  serviceId: MaybeRefOrGetter<string | null | undefined>,
  templateId: MaybeRefOrGetter<T>,
): UseSendEmail<T> {
  const client = useFrontmail();
  const status = ref<SendStatus>('idle');
  const error = shallowRef<FrontmailError | null>(null);
  const result = shallowRef<SendResult | null>(null);
  let callId = 0;

  async function run(fn: () => Promise<SendResult>) {
    const id = ++callId;
    status.value = 'sending';
    error.value = null;
    result.value = null;
    try {
      const r = await fn();
      if (id === callId) {
        result.value = r;
        status.value = r.status === 'held' ? 'held' : 'sent';
      }
      return r;
    } catch (e) {
      if (id === callId) {
        error.value = toFrontmailError(e);
        status.value = 'error';
      }
      return undefined;
    }
  }

  return {
    status: readonly(status),
    error: readonly(error) as Readonly<Ref<FrontmailError | null>>,
    result: readonly(result) as Readonly<Ref<SendResult | null>>,
    send: (params, options) => run(() => client.send(toValue(serviceId), toValue(templateId), params, options)),
    sendForm: (form, options) => run(() => client.sendForm(toValue(serviceId), toValue(templateId), form, options)),
    reset() {
      callId++;
      status.value = 'idle';
      error.value = null;
      result.value = null;
    },
  };
}
