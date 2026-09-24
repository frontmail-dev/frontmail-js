# @frontmail/sdk-core

Zero-dependency, isomorphic core used by every Frontmail SDK (`@frontmail/browser`, `react`, `vue`,
`svelte`, `node`, `emailjs-compat`). You normally install one of those instead – use the core directly
only when building your own integration.

```sh
npm i @frontmail/sdk-core
```

```ts
import { createClient } from '@frontmail/sdk-core';

const client = createClient({ publicKey: 'pk_…' });
const { messageId, status, statusToken } = await client.send('svc_…', 'tpl_…', { name: 'Jan' });
await client.sendForm('svc_…', 'tpl_…', '#contact-form'); // multipart, file inputs → attachments
await client.getStatus(messageId, { token: statusToken });
```

## Client options

| Option | Default | Description |
|---|---|---|
| `publicKey` | – | `pk_…` for browsers (sent as `user_id` + `X-Frontmail-Public-Key`) |
| `privateKey` | – | `sk_…`, server only (`Authorization: Bearer`) |
| `apiUrl` | `https://api.frontmail.dev` | API origin |
| `retry` | `{ retries: 3, baseDelayMs: 300, maxDelayMs: 10000 }` | `false` disables retries |
| `timeoutMs` | `15000` | per attempt (AbortController) |
| `blockHeadless` | `false` | refuse to send from `navigator.webdriver` / headless user agents |
| `blockList` | – | `{ list: string[], watchVariable: 'email' }` – refuse listed values |
| `limitRate` | – | `{ id?: string, throttle: ms }` – one accepted send per `throttle` ms (localStorage) |
| `storageProvider` | `localStorage` | `{ get(key), set(key, value) }` (sync or async) for `limitRate` |
| `fetch` | `globalThis.fetch` | custom fetch |
| `clientName` | – | `X-Frontmail-Client` header value |

Per-call `SendOptions` accept the same guards plus `idempotencyKey`, `turnstileToken`, `attachments`
(`{ filename, contentType, contentBase64 }` or `{ uploadId }`) and `signal`.

## Reliability

- **Retries** with exponential backoff and *full jitter* for network errors, timeouts, `5xx` and `429`.
  `429` honours `Retry-After` (up to 60 s; longer waits fail immediately with `RateLimitError`).
- **Idempotency**: every logical send gets an `Idempotency-Key` (UUID via `crypto.randomUUID`, with a
  `getRandomValues` fallback) that is **reused across its retries**, so a retry never sends twice.
- The result is `{ messageId, status: 'queued' | 'held', statusToken, status_code: 202, text: 'OK' }`.
  `held` means the email was accepted and waits for credits – it is never dropped.

## Errors

Everything throws a `FrontmailError` (`code`, `status`, `message`, `docsUrl`, `details`, `retryAfter`):

| Class | When |
|---|---|
| `NetworkError` | no HTTP response (`network_error`, `timeout`), `status: 0` |
| `ValidationError` | `400` / `422` (e.g. `invalid_template_params`, see `details`) |
| `AuthError` | `401`, and `403` `forbidden` / `origin_not_allowed` / `private_key_required` |
| `InsufficientCreditsError` | `402` (organization in `reject` mode) |
| `RateLimitError` | `429` |
| `BlockedError` | client-side block: `headless_blocked`, `recipient_blocked` (block list), `rate_limited` (`limitRate`) |
| `FrontmailError` | anything else (`404`, `409`, `413`, `451`, `5xx`, `aborted`, `invalid_response`…) |

Error codes are documented at https://docs.frontmail.dev/reference/errors/.

## Helpers

- `formToParams(form | selector)` → `{ params, files, turnstileToken }`
- `loadTurnstile()`, `renderTurnstile(el, { sitekey })`, `getTurnstileToken(siteKey | formOrContainer)` –
  lazily loads `https://challenges.cloudflare.com/turnstile/v0/api.js`. Inside a form the widget adds
  a hidden `cf-turnstile-response` input that `sendForm` submits automatically; for `send()` pass
  `{ turnstileToken }`.
- `blockHeadless`, `blockList`, `limitRate`, `isHeadlessBrowser`, `uuid`, `backoffDelay`, `parseRetryAfter`.

## Typed params

`FrontmailTemplates` is an empty interface that `npx frontmail types` (from `@frontmail/node`) augments,
so `send('tpl_contact', params)` checks `params` at compile time. See `@frontmail/node`.

MIT
