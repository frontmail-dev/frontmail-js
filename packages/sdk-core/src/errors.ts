/**
 * Error codes returned by the Frontmail API (kept in sync with the server-side list) plus
 * client-only codes produced by the SDK itself (`network_error`, `timeout`, `aborted`,
 * `invalid_response`).
 */
export type ApiErrorCode =
  | 'bad_request'
  | 'invalid_body'
  | 'invalid_idempotency_key'
  | 'unauthorized'
  | 'invalid_public_key'
  | 'invalid_private_key'
  | 'insufficient_credits'
  | 'forbidden'
  | 'origin_not_allowed'
  | 'captcha_required'
  | 'captcha_failed'
  | 'headless_blocked'
  | 'recipient_blocked'
  | 'private_key_required'
  | 'email_not_verified'
  | 'organization_suspended'
  | 'plan_limit_reached'
  | 'dynamic_recipient_not_allowed'
  | 'attachments_not_allowed'
  | 'not_found'
  | 'service_not_found'
  | 'template_not_found'
  | 'message_not_found'
  | 'conflict'
  | 'idempotency_conflict'
  | 'payload_too_large'
  | 'attachment_too_large'
  | 'invalid_template_params'
  | 'template_render_failed'
  | 'invalid_recipient'
  | 'service_unavailable_for_template'
  | 'rate_limited'
  | 'test_send_limit'
  | 'recipient_suppressed'
  | 'internal_error'
  | 'provider_error'
  | 'service_unavailable';

export type ClientErrorCode = 'network_error' | 'timeout' | 'aborted' | 'invalid_response' | 'not_initialized';

export type ErrorCode = ApiErrorCode | ClientErrorCode;

export const DOCS_BASE_URL = 'https://docs.frontmail.dev';

export function docsUrlFor(code: string): string {
  return DOCS_BASE_URL + '/reference/errors/#' + code.replace(/_/g, '-');
}

export interface FrontmailErrorInit {
  /** HTTP status; `0` for client-side errors (network, timeout, blocks). */
  status?: number;
  docsUrl?: string;
  details?: unknown;
  /** Seconds, parsed from `Retry-After`. */
  retryAfter?: number;
  cause?: unknown;
}

/** Base class of every error thrown by Frontmail SDKs. */
export class FrontmailError extends Error {
  override name = 'FrontmailError';
  // `declare` keeps the fields out of the emitted code (smaller bundle); they are set below.
  declare readonly code: ErrorCode;
  declare readonly status: number;
  declare readonly docsUrl: string;
  declare readonly details?: unknown;
  declare readonly retryAfter?: number;

  constructor(code: ErrorCode, message: string, init: FrontmailErrorInit = {}) {
    super(message, { cause: init.cause });
    Object.assign(this, {
      code,
      status: init.status ?? 0,
      docsUrl: init.docsUrl ?? docsUrlFor(code),
      details: init.details,
      retryAfter: init.retryAfter,
    });
  }
}

/** The request never produced an HTTP response (offline, DNS, CORS, timeout). */
export class NetworkError extends FrontmailError {
  override name = 'NetworkError';
}
/** HTTP 429 – `retryAfter` holds the server's hint in seconds. */
export class RateLimitError extends FrontmailError {
  override name = 'RateLimitError';
}
/** HTTP 400 / 422 – invalid body or template params; see `details`. */
export class ValidationError extends FrontmailError {
  override name = 'ValidationError';
}
/** HTTP 401 and key/origin related 403 responses. */
export class AuthError extends FrontmailError {
  override name = 'AuthError';
}
/** HTTP 402 – organization is in `reject` mode and has no credits left. */
export class InsufficientCreditsError extends FrontmailError {
  override name = 'InsufficientCreditsError';
}
/** Request was blocked on the client by `blockHeadless`, `blockList` or `limitRate`. */
export class BlockedError extends FrontmailError {
  override name = 'BlockedError';
}

const AUTH_403 = ['forbidden', 'origin_not_allowed', 'private_key_required'];

/** Maps an HTTP error response to the matching `FrontmailError` subclass. */
export function errorFromResponse(status: number, body: unknown, retryAfter?: number): FrontmailError {
  const e = (body as { error?: { code?: string; message?: string; docs_url?: string; details?: unknown } } | null)?.error;
  const code = (e?.code ?? (status >= 500 ? 'internal_error' : 'bad_request')) as ErrorCode;
  const Ctor =
    status == 429
      ? RateLimitError
      : status == 402
        ? InsufficientCreditsError
        : status == 422 || status == 400
          ? ValidationError
          : status == 401 || (status == 403 && AUTH_403.includes(code))
            ? AuthError
            : FrontmailError;
  return new Ctor(code, e?.message ?? 'Request failed with status ' + status, {
    status,
    docsUrl: e?.docs_url,
    details: e?.details,
    retryAfter,
  });
}

export function isFrontmailError(err: unknown): err is FrontmailError {
  return err instanceof FrontmailError;
}

/** HTTP status for each API error code (mirrors the server-side table). */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  invalid_body: 400,
  invalid_idempotency_key: 400,
  unauthorized: 401,
  invalid_public_key: 401,
  invalid_private_key: 401,
  insufficient_credits: 402,
  forbidden: 403,
  origin_not_allowed: 403,
  captcha_required: 403,
  captcha_failed: 403,
  headless_blocked: 403,
  recipient_blocked: 403,
  private_key_required: 403,
  email_not_verified: 403,
  organization_suspended: 403,
  plan_limit_reached: 403,
  dynamic_recipient_not_allowed: 403,
  attachments_not_allowed: 403,
  not_found: 404,
  service_not_found: 404,
  template_not_found: 404,
  message_not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  payload_too_large: 413,
  attachment_too_large: 413,
  invalid_template_params: 422,
  template_render_failed: 422,
  invalid_recipient: 422,
  service_unavailable_for_template: 422,
  rate_limited: 429,
  test_send_limit: 429,
  recipient_suppressed: 451,
  internal_error: 500,
  provider_error: 502,
  service_unavailable: 503,
};
