import { ERROR_STATUS, FrontmailError, ValidationError, createClient, errorFromResponse, isBrowser, uuid } from '@frontmail/sdk-core';
import type {
  ApiErrorCode,
  AttachmentInput,
  Client,
  ClientOptions,
  MessageStatus,
  MessageStatusResponse,
  SendResult,
  TemplateParams,
} from '@frontmail/sdk-core';
import { camelize } from '@frontmail/sdk-core';
import { version } from '../package.json';
import type { TemplateSchema } from './codegen';

export const CLIENT_NAME = '@frontmail/node/' + version;
export const MAX_BATCH = 100;

export interface FrontmailNodeOptions
  extends Pick<ClientOptions, 'apiUrl' | 'retry' | 'timeoutMs' | 'fetch' | 'dangerouslyAllowPrivateKeyInBrowser'> {
  /** Private key `sk_…`. Defaults to `process.env.FRONTMAIL_PRIVATE_KEY`. */
  privateKey?: string;
}

const BROWSER_MESSAGE =
  '@frontmail/node is a server-side SDK: it uses your private key (sk_…), which must never reach a browser. ' +
  'Use @frontmail/browser (or the React/Vue/Svelte SDK) with your public key (pk_…) in the page.';

// Warn once at import time – bundling this package into a web page is almost always a mistake.
if (isBrowser()) console.warn('[frontmail] ' + BROWSER_MESSAGE);

export interface SendInput<T extends string = string> {
  /** Omit to use the organization's default service. */
  serviceId?: string;
  templateId: T;
  params?: TemplateParams<T>;
  attachments?: AttachmentInput[];
  /** Defaults to a random UUID (reused across retries). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export type BatchItemResult =
  | { index: number; ok: true; messageId: string; status: 'queued' | 'held' }
  | { index: number; ok: false; error: FrontmailError };

export interface HistoryQuery {
  /** Page size (≤ 100, default 25). */
  limit?: number;
  cursor?: string;
  status?: MessageStatus;
  templateId?: string;
  serviceId?: string;
  /** ISO timestamps. */
  from?: string;
  to?: string;
  /** Recipient search. */
  q?: string;
}

export interface HistoryItem {
  messageId: string;
  status: MessageStatus;
  templateId: string;
  serviceId: string;
  subject?: string;
  to: string[];
  createdAt: string;
  [key: string]: unknown;
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

/**
 * Result of `history()`: await it for one page, or iterate with `for await` over all items
 * (pages are fetched lazily). `.pages()` iterates page by page.
 */
export class HistoryRequest implements PromiseLike<HistoryPage>, AsyncIterable<HistoryItem> {
  constructor(
    private readonly fetchPage: (cursor: string | undefined) => Promise<HistoryPage>,
    private readonly cursor: string | undefined,
  ) {}

  then<A = HistoryPage, B = never>(
    onfulfilled?: ((value: HistoryPage) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.fetchPage(this.cursor).then(onfulfilled, onrejected);
  }

  async *pages(): AsyncGenerator<HistoryPage> {
    let cursor = this.cursor;
    do {
      const page = await this.fetchPage(cursor);
      yield page;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<HistoryItem> {
    for await (const page of this.pages()) yield* page.items;
  }
}

interface RawSend {
  message_id: string;
  status: 'queued' | 'held';
  status_token: string;
}

interface RawBatch {
  results: Array<{ index: number; message_id?: string; status?: 'queued' | 'held'; error?: { code: ApiErrorCode; message: string; docs_url?: string; details?: unknown } }>;
}

interface RawTemplate {
  template_id: string;
  name: string;
  params?: TemplateSchema['params'];
  [key: string]: unknown;
}

const toBody = (m: SendInput, idempotencyKey?: string) => ({
  service_id: m.serviceId,
  template_id: m.templateId,
  template_params: m.params ?? {},
  attachments: m.attachments?.map((a) =>
    'uploadId' in a ? { upload_id: a.uploadId } : { filename: a.filename, content_type: a.contentType, content_base64: a.contentBase64 },
  ),
  idempotency_key: idempotencyKey,
});

const toTemplate = (t: RawTemplate): TemplateSchema => ({ templateId: t.template_id, name: t.name, params: t.params ?? [] });

/** Server-side Frontmail client (private key). */
export class Frontmail {
  readonly client: Client;

  constructor(options: FrontmailNodeOptions = {}) {
    if (isBrowser() && !options.dangerouslyAllowPrivateKeyInBrowser) {
      throw new FrontmailError('private_key_in_browser', BROWSER_MESSAGE);
    }
    const env = globalThis.process?.env ?? {};
    const privateKey = options.privateKey ?? env.FRONTMAIL_PRIVATE_KEY;
    if (!privateKey) {
      throw new FrontmailError('private_key_required', 'Pass { privateKey } or set FRONTMAIL_PRIVATE_KEY.');
    }
    this.client = createClient({
      ...options,
      apiUrl: options.apiUrl ?? env.FRONTMAIL_API_URL,
      privateKey,
      clientName: CLIENT_NAME,
    });
  }

  /** Sends one email. */
  async send<T extends string>(input: SendInput<T>): Promise<SendResult> {
    const raw = await this.client.request<RawSend>('/v1/send', {
      method: 'POST',
      body: toBody(input),
      idempotencyKey: input.idempotencyKey ?? uuid(),
      signal: input.signal,
    });
    return { messageId: raw.message_id, status: raw.status, statusToken: raw.status_token, status_code: 202, text: 'OK' };
  }

  /** Sends up to 100 emails in one request. Never throws for per-item errors – check `ok`. */
  async sendBatch(messages: SendInput[], options: { signal?: AbortSignal } = {}): Promise<BatchItemResult[]> {
    if (messages.length > MAX_BATCH) {
      throw new ValidationError('invalid_body', `A batch can contain at most ${MAX_BATCH} messages (got ${messages.length}).`, {
        status: 400,
      });
    }
    if (!messages.length) return [];
    const body = { messages: messages.map((m) => toBody(m, m.idempotencyKey ?? uuid())) };
    const raw = await this.client.request<RawBatch>('/v1/send-batch', {
      method: 'POST',
      body,
      idempotencyKey: uuid(),
      signal: options.signal,
    });
    return raw.results.map((r) =>
      r.error
        ? { index: r.index, ok: false, error: errorFromResponse(ERROR_STATUS[r.error.code] ?? 400, { error: r.error }) }
        : { index: r.index, ok: true, messageId: r.message_id!, status: r.status! },
    );
  }

  /** Message history. `await` for one page or `for await` to iterate over all pages. */
  history(query: HistoryQuery = {}): HistoryRequest {
    const { cursor, templateId, serviceId, ...rest } = query;
    return new HistoryRequest(
      async (c) =>
        camelize<HistoryPage>(
          await this.client.request('/v1/history', {
            query: { ...rest, template_id: templateId, service_id: serviceId, cursor: c },
          }),
        ),
      cursor,
    );
  }

  /** Current status and event timeline of a message. */
  async getMessage(messageId: string): Promise<MessageStatusResponse> {
    return this.client.getStatus(messageId);
  }

  readonly templates = {
    /** Templates with their parameter schemas. */
    list: async (): Promise<TemplateSchema[]> => {
      const raw = await this.client.request<{ items: RawTemplate[] }>('/v1/templates');
      return raw.items.map(toTemplate);
    },
    get: async (templateId: string): Promise<TemplateSchema> =>
      toTemplate(await this.client.request<RawTemplate>('/v1/templates/' + encodeURIComponent(templateId))),
  };
}
