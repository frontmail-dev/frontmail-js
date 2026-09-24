/**
 * Map of template ids to their parameter types. Empty by default – `npx frontmail types`
 * generates a declaration file that augments it, e.g.
 *
 * ```ts
 * declare module '@frontmail/react' {
 *   interface FrontmailTemplates { tpl_contact: ContactFormParams }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FrontmailTemplates {}

/** Known template ids (after augmentation) while still accepting any string. */
export type TemplateId = [keyof FrontmailTemplates] extends [never]
  ? string
  : (keyof FrontmailTemplates & string) | (string & {});

/** Params type for a template id; falls back to a loose record for unknown ids. */
export type TemplateParams<T extends string> = T extends keyof FrontmailTemplates
  ? FrontmailTemplates[T]
  : Record<string, unknown>;

/** Sync or async key/value storage used by `limitRate` (defaults to `localStorage`). */
export interface StorageProvider {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, value: string): void | Promise<void>;
}

export interface BlockListOptions {
  /** Values that must not be sent. Compared case-insensitively after trimming. */
  list: string[];
  /** Template param (or form field) whose value is checked against `list`. */
  watchVariable?: string;
}

export interface LimitRateOptions {
  /** Throttle bucket id; defaults to `location.pathname`. */
  id?: string;
  /** Minimum milliseconds between two accepted sends. */
  throttle: number;
}

export interface GuardOptions {
  /** Refuse to send from automated / headless browsers. */
  blockHeadless?: boolean;
  blockList?: BlockListOptions;
  limitRate?: LimitRateOptions;
  storageProvider?: StorageProvider;
}

export interface RetryOptions {
  /** Retries after the first attempt. Default `3`. */
  retries?: number;
  /** Base delay for exponential backoff with full jitter. Default `300` ms. */
  baseDelayMs?: number;
  /** Upper bound for a single backoff delay. Default `10000` ms. */
  maxDelayMs?: number;
}

export interface ClientOptions extends GuardOptions {
  /** Public key `pk_…` (browser). */
  publicKey?: string;
  /** Private key `sk_…` (server only – never ship it to a browser). */
  privateKey?: string;
  /** Default `https://api.frontmail.dev`. */
  apiUrl?: string;
  /** Retry policy for network errors, 5xx and 429. `false` disables retries. */
  retry?: RetryOptions | false;
  /** Per-attempt timeout. Default `15000` ms. */
  timeoutMs?: number;
  /** Custom fetch implementation (tests, proxies). */
  fetch?: typeof fetch;
  /** Value of the `X-Frontmail-Client` header, e.g. `@frontmail/react/1.0.0`. */
  clientName?: string;
  /** Override endpoint paths (used by the EmailJS compatibility layer). */
  paths?: { send?: string; sendForm?: string };
}

export type AttachmentInput =
  | { filename: string; contentType: string; contentBase64: string }
  | { uploadId: string };

export interface SendOptions extends GuardOptions {
  publicKey?: string;
  privateKey?: string;
  /** Explicit idempotency key; by default a UUID is generated per logical send. */
  idempotencyKey?: string;
  /** Cloudflare Turnstile token (`sendForm` also reads the `cf-turnstile-response` field). */
  turnstileToken?: string;
  attachments?: AttachmentInput[];
  signal?: AbortSignal;
}

export type AcceptedStatus = 'queued' | 'held';

export interface SendResult {
  messageId: string;
  /** `queued` = accepted for delivery, `held` = accepted and waiting for credits. */
  status: AcceptedStatus;
  /** Lets a public-key client read the message status via `getStatus`. */
  statusToken: string;
  status_code: 202;
  text: 'OK';
}

export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'held'
  | 'held_service_error'
  | 'discarded';

export interface MessageEvent {
  type: string;
  at: string;
  [key: string]: unknown;
}

export interface MessageStatusResponse {
  messageId: string;
  status: MessageStatus;
  createdAt: string;
  sentAt?: string;
  templateId?: string;
  serviceId?: string;
  events: MessageEvent[];
  [key: string]: unknown;
}

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Plain object (sent as JSON) or `FormData` (multipart). */
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  publicKey?: string;
  privateKey?: string;
  signal?: AbortSignal;
}

export interface Client {
  readonly options: ClientOptions;
  send<T extends string>(
    serviceId: string | null | undefined,
    templateId: T,
    params?: TemplateParams<T>,
    options?: SendOptions,
  ): Promise<SendResult>;
  sendForm(
    serviceId: string | null | undefined,
    templateId: string,
    form: HTMLFormElement | string,
    options?: SendOptions,
  ): Promise<SendResult>;
  getStatus(messageId: string, options?: { token?: string; signal?: AbortSignal }): Promise<MessageStatusResponse>;
  /** Low-level JSON request with retries, used by server SDKs. Returns the raw (snake_case) body. */
  request<R = unknown>(path: string, options?: RequestOptions): Promise<R>;
}
