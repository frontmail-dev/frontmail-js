import { FrontmailError, NetworkError, errorFromResponse } from './errors';
import { TURNSTILE_FIELD, formData, resolveForm } from './form';
import { blockHeadless, blockList, limitRate } from './guards';
import type { Client, ClientOptions, RequestOptions, SendOptions, SendResult } from './types';
import { backoffDelay, camelize, isBrowser, parseRetryAfter, sleep, uuid } from './utils';

export const DEFAULT_API_URL = 'https://api.frontmail.dev';
/** Header carrying the `statusToken` returned by `send` when reading a message status. */
export const STATUS_TOKEN_HEADER = 'X-Frontmail-Status-Token';
/** 429 responses asking to wait longer than this are not retried. */
const MAX_RETRY_AFTER_S = 60;

interface RawSendResponse {
  message_id: string;
  status: 'queued' | 'held';
  status_token: string;
}

/**
 * Throws `private_key_in_browser` when a private key is used in a web browser. A private key
 * (`sk_…`) bypasses the origin allowlist and CAPTCHA and can read the message history, so it
 * must never be shipped to a page. `dangerouslyAllowPrivateKeyInBrowser: true` opts out (e.g.
 * an internal admin tool on a trusted machine); the API additionally rejects private keys sent
 * with an `Origin` header unless the organization allows it.
 */
export function assertPrivateKeyAllowed(privateKey: string | undefined, allow: boolean | undefined): void {
  if (privateKey && !allow && isBrowser()) {
    throw new FrontmailError(
      'private_key_in_browser',
      'Private keys (sk_…) must not be used in a browser. Use the public key (pk_…).',
    );
  }
}

/** Creates an isomorphic Frontmail API client (fetch-based, zero dependencies). */
export function createClient(options: ClientOptions = {}): Client {
  assertPrivateKeyAllowed(options.privateKey, options.dangerouslyAllowPrivateKeyInBrowser);
  const request = async <R>(path: string, o: RequestOptions = {}): Promise<R> => {
    const retry = options.retry === false ? { retries: 0 } : (options.retry ?? {});
    const retries = retry.retries ?? 3;
    const fetchFn = options.fetch ?? globalThis.fetch;
    const base = (options.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
    let url = base + path;
    if (o.query) {
      // No URLSearchParams: React Native's implementation is incomplete.
      const qs: string[] = [];
      for (const k in o.query) {
        const v = o.query[k];
        if (v != null) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
      }
      if (qs.length) url += '?' + qs.join('&');
    }
    const headers: Record<string, string> = { ...o.headers };
    if (options.clientName) headers['X-Frontmail-Client'] = options.clientName;
    const privateKey = o.privateKey ?? options.privateKey;
    assertPrivateKeyAllowed(privateKey, options.dangerouslyAllowPrivateKeyInBrowser);
    const publicKey = o.publicKey ?? options.publicKey;
    if (privateKey) headers.Authorization = 'Bearer ' + privateKey;
    else if (publicKey) headers['X-Frontmail-Public-Key'] = publicKey;
    if (o.idempotencyKey) headers['Idempotency-Key'] = o.idempotencyKey;
    let body = o.body as BodyInit | undefined;
    if (body != null && !(typeof FormData != 'undefined' && body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => ((timedOut = true), ctrl.abort()), options.timeoutMs ?? 15000);
      const onAbort = () => ctrl.abort();
      o.signal?.addEventListener('abort', onAbort);
      let res: Response;
      let err: FrontmailError | undefined;
      let wait: number | undefined;
      try {
        res = await fetchFn(url, { method: o.method ?? (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal });
      } catch (e) {
        if (o.signal?.aborted) throw new FrontmailError('aborted', 'Request aborted.', { cause: e });
        res = undefined as never;
        err = timedOut
          ? new NetworkError('timeout', 'Request timed out.', { cause: e })
          : new NetworkError('network_error', 'Network request failed.', { cause: e });
      } finally {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', onAbort);
      }
      if (res) {
        const data: unknown = await res.json().catch(() => null);
        if (res.ok) return data as R;
        const retryAfter = parseRetryAfter(res.headers.get('Retry-After'));
        err = errorFromResponse(res.status, data, retryAfter);
        if (res.status < 500 && res.status != 429) throw err;
        if (retryAfter != null) {
          if (retryAfter > MAX_RETRY_AFTER_S) throw err;
          wait = retryAfter * 1000;
        }
      }
      if (attempt >= retries) throw err;
      await sleep(wait ?? backoffDelay(attempt, retry.baseDelayMs ?? 300, retry.maxDelayMs ?? 10000));
    }
  };

  const guarded = async (
    o: SendOptions,
    lookup: (name: string) => unknown,
    run: (idempotencyKey: string) => Promise<RawSendResponse>,
  ): Promise<SendResult> => {
    blockHeadless(o.blockHeadless ?? options.blockHeadless);
    blockList(o.blockList ?? options.blockList, lookup);
    const record = await limitRate(o.limitRate ?? options.limitRate, o.storageProvider ?? options.storageProvider);
    const raw = await run(o.idempotencyKey || uuid());
    if (!raw || !raw.message_id) throw new FrontmailError('invalid_response', 'Unexpected API response.');
    await record();
    return { messageId: raw.message_id, status: raw.status, statusToken: raw.status_token, status_code: 202, text: 'OK' };
  };

  return {
    options,
    request,
    send(serviceId, templateId, params, o = {}) {
      const p = (params ?? {}) as Record<string, unknown>;
      const publicKey = o.publicKey ?? options.publicKey;
      return guarded(o, (n) => p[n], (idempotencyKey) =>
        request<RawSendResponse>(options.paths?.send ?? '/v1/send', {
          body: {
            service_id: serviceId || undefined,
            template_id: templateId,
            user_id: publicKey,
            template_params: p,
            turnstile_token: o.turnstileToken,
            turnstile_key: o.turnstileKey,
            attachments: o.attachments?.map((a) =>
              'uploadId' in a
                ? { upload_id: a.uploadId }
                : { filename: a.filename, content_type: a.contentType, content_base64: a.contentBase64 },
            ),
          },
          idempotencyKey,
          publicKey: o.publicKey,
          privateKey: o.privateKey,
          signal: o.signal,
        }),
      );
    },
    async sendForm(serviceId, templateId, form, o = {}) {
      const fd = formData(resolveForm(form), o.formFields);
      const publicKey = o.publicKey ?? options.publicKey;
      if (serviceId) fd.set('service_id', serviceId);
      fd.set('template_id', templateId);
      if (publicKey) fd.set('user_id', publicKey);
      if (o.turnstileToken) fd.set(TURNSTILE_FIELD, o.turnstileToken);
      if (o.turnstileKey) fd.set('turnstile_key', o.turnstileKey);
      return guarded(o, (n) => fd.get(n), (idempotencyKey) =>
        request<RawSendResponse>(options.paths?.sendForm ?? '/v1/send-form', {
          method: 'POST',
          body: fd,
          idempotencyKey,
          publicKey: o.publicKey,
          privateKey: o.privateKey,
          signal: o.signal,
        }),
      );
    },
    async getStatus(messageId, o = {}) {
      return camelize(
        await request('/v1/messages/' + encodeURIComponent(messageId), {
          // Header, not `?token=`: query strings end up in access logs, HAR files and error trackers.
          headers: o.token ? { [STATUS_TOKEN_HEADER]: o.token } : undefined,
          signal: o.signal,
        }),
      );
    },
  };
}
