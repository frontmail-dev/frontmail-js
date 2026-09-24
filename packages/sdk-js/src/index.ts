import { FrontmailError, createClient } from '@frontmail/sdk-core';
import type {
  Client,
  ClientOptions,
  MessageStatusResponse,
  SendOptions,
  SendResult,
  TemplateParams,
} from '@frontmail/sdk-core';
import { version } from '../package.json';

export {
  AuthError,
  BlockedError,
  FrontmailError,
  InsufficientCreditsError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '@frontmail/sdk-core';
export type {
  ClientOptions,
  ErrorCode,
  FrontmailTemplates,
  MessageStatus,
  MessageStatusResponse,
  SendOptions,
  SendResult,
  TemplateId,
  TemplateParams,
} from '@frontmail/sdk-core';

export type InitOptions = Omit<ClientOptions, 'clientName' | 'paths'>;

let client: Client | undefined;
let defaults: InitOptions = {};

const CLIENT_NAME = '@frontmail/browser/' + version;

/** Configures the SDK. Call once before `send` / `sendForm` (or pass `publicKey` per call). */
export function init(options: InitOptions | string): void {
  defaults = typeof options == 'string' ? { publicKey: options } : options;
  client = createClient({ ...defaults, clientName: CLIENT_NAME });
}

/** Per-call options; a string is treated as the public key (EmailJS style). */
export type CallOptions = SendOptions | string;

const opts = (o?: CallOptions): SendOptions => (typeof o == 'string' ? { publicKey: o } : o || {});

function current(o: SendOptions): Client {
  if (!client && !o.publicKey && !o.privateKey) {
    throw new FrontmailError('not_initialized', 'Call init({ publicKey }) before sending.');
  }
  return client || createClient({ clientName: CLIENT_NAME });
}

/** Sends an email using a template. Resolves once the API accepted (`queued`) or held it. */
export async function send<T extends string>(
  serviceId: string | null | undefined,
  templateId: T,
  params?: TemplateParams<T>,
  options?: CallOptions,
): Promise<SendResult> {
  const o = opts(options);
  return current(o).send(serviceId, templateId, params, o);
}

/** Sends a form (element or CSS selector) as `multipart/form-data`; file inputs become attachments. */
export async function sendForm(
  serviceId: string | null | undefined,
  templateId: string,
  form: HTMLFormElement | string,
  options?: CallOptions,
): Promise<SendResult> {
  const o = opts(options);
  return current(o).sendForm(serviceId, templateId, form, o);
}

/** Reads the delivery status of a message. Public-key clients pass the `statusToken` from `send`. */
export async function getStatus(messageId: string, options: { token?: string } = {}): Promise<MessageStatusResponse> {
  return current(defaults).getStatus(messageId, options);
}

export default { init, send, sendForm, getStatus, FrontmailError };
