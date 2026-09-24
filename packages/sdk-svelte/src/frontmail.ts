import { FrontmailError, createClient, isFrontmailError } from '@frontmail/sdk-core';
import type {
  Client,
  ClientOptions,
  MessageStatusResponse,
  SendOptions,
  SendResult,
  TemplateParams,
} from '@frontmail/sdk-core';
import { getContext, setContext } from 'svelte';
import { derived, writable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { VERSION } from './version.js';

export const CLIENT_NAME = '@frontmail/svelte/' + VERSION;

/** `sent` = accepted by the API and queued for delivery; `held` = accepted and waiting for credits. */
export type SendStatus = 'idle' | 'sending' | 'sent' | 'held' | 'error';

export interface SendState {
  status: SendStatus;
  error: FrontmailError | null;
  result: SendResult | null;
}

export type FrontmailOptions = Omit<ClientOptions, 'clientName'> & { client?: Client };

export interface FrontmailInstance {
  client: Client;
  /** Store with `{ status, error, result }` of the latest send. */
  state: Readable<SendState>;
  /** Store with just the status. */
  status: Readable<SendStatus>;
  /** Resolves with the result, or `undefined` on error (see the `state` store). */
  send<T extends string>(
    serviceId: string | null | undefined,
    templateId: T,
    params?: TemplateParams<T>,
    options?: SendOptions,
  ): Promise<SendResult | undefined>;
  sendForm(
    serviceId: string | null | undefined,
    templateId: string,
    form: HTMLFormElement | string,
    options?: SendOptions,
  ): Promise<SendResult | undefined>;
  getStatus(messageId: string, options?: { token?: string }): Promise<MessageStatusResponse>;
  /** Runs any send through this instance's stores (used by `use:frontmailForm`). */
  track(fn: () => Promise<SendResult>, onState?: (state: SendState) => void): Promise<SendResult | undefined>;
  reset(): void;
}

export const IDLE: SendState = { status: 'idle', error: null, result: null };

export function toFrontmailError(e: unknown): FrontmailError {
  return isFrontmailError(e) ? e : new FrontmailError('internal_error', e instanceof Error ? e.message : String(e), { cause: e });
}

/** Runs a send and reports `sending → sent | held | error` transitions. */
export async function trackSend(
  fn: () => Promise<SendResult>,
  onState: (state: SendState) => void,
): Promise<SendResult | undefined> {
  onState({ status: 'sending', error: null, result: null });
  try {
    const result = await fn();
    onState({ status: result.status === 'held' ? 'held' : 'sent', error: null, result });
    return result;
  } catch (e) {
    onState({ status: 'error', error: toFrontmailError(e), result: null });
    return undefined;
  }
}

let defaultInstance: FrontmailInstance | undefined;

/** The first instance created by `createFrontmail` (used by `use:frontmailForm` when none is passed). */
export function getDefaultFrontmail(): FrontmailInstance | undefined {
  return defaultInstance;
}

/** Creates a client plus stores tracking the latest send. */
export function createFrontmail(options: FrontmailOptions = {}): FrontmailInstance {
  const { client: existing, ...rest } = options;
  const client = existing ?? createClient({ ...rest, clientName: CLIENT_NAME });
  const state = writable<SendState>(IDLE);
  let callId = 0;
  const run = (fn: () => Promise<SendResult>, onState?: (state: SendState) => void) => {
    const id = ++callId;
    return trackSend(fn, (s) => {
      if (id === callId) state.set(s);
      onState?.(s);
    });
  };
  const instance: FrontmailInstance = {
    client,
    state: { subscribe: state.subscribe },
    status: derived(state, (s) => s.status),
    send: (serviceId, templateId, params, o) => run(() => client.send(serviceId, templateId, params, o)),
    sendForm: (serviceId, templateId, form, o) => run(() => client.sendForm(serviceId, templateId, form, o)),
    getStatus: (id, o) => client.getStatus(id, o),
    track: run,
    reset() {
      callId++;
      state.set(IDLE);
    },
  };
  defaultInstance ??= instance;
  return instance;
}

const KEY = Symbol.for('@frontmail/svelte');

/** Makes an instance available to descendants (`<FrontmailForm>` picks it up automatically). */
export function setFrontmail(instance: FrontmailInstance): FrontmailInstance {
  return setContext(KEY, instance);
}

/** Reads the instance set by `setFrontmail` in a parent component. */
export function getFrontmail(): FrontmailInstance | undefined {
  return getContext<FrontmailInstance | undefined>(KEY);
}
