# @frontmail/browser

Send emails straight from the browser with [Frontmail](https://frontmail.dev). EmailJS-style API,
**< 3 kB gzip**, automatic retries with idempotency keys, typed errors and Turnstile support.

```sh
npm i @frontmail/browser
```

```ts
import frontmail from '@frontmail/browser'; // or: import { init, send, sendForm, getStatus } from '@frontmail/browser'

frontmail.init({ publicKey: 'pk_…' });

const res = await frontmail.send('svc_…', 'tpl_…', { name: 'Jan', email: 'jan@example.com' });
// res = { messageId, status: 'queued' | 'held', statusToken, status_code: 202, text: 'OK' }

await frontmail.sendForm('svc_…', 'tpl_…', '#contact-form'); // element or selector; files → attachments
await frontmail.getStatus(res.messageId, { token: res.statusToken }); // → { status: 'sent' | 'delivered' | … }
```

`serviceId` may be `null` to use the organization's default service. The last argument of `send` /
`sendForm` can be a public key string (EmailJS style) or `SendOptions`
(`{ publicKey, idempotencyKey, turnstileToken, attachments, blockHeadless, blockList, limitRate, signal }`).

### `<script>` / CDN (UMD)

```html
<script src="https://cdn.jsdelivr.net/npm/@frontmail/browser/dist/frontmail.umd.js"></script>
<script>
  frontmail.init({ publicKey: 'pk_…' });
  document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { status } = await frontmail.sendForm('svc_…', 'tpl_…', e.target);
      console.log(status); // 'queued' or 'held'
    } catch (err) {
      console.error(err.code, err.message, err.docsUrl);
    }
  });
</script>
```

## Options (`init`)

`publicKey`, `apiUrl` (default `https://api.frontmail.dev`), `retry` (`{ retries: 3, baseDelayMs: 300, maxDelayMs: 10000 }` or
`false`), `timeoutMs` (15000), `blockHeadless`, `blockList: { list, watchVariable }`,
`limitRate: { id?, throttle }`, `storageProvider`, `fetch`. Details: [`@frontmail/sdk-core`](../sdk-core/README.md).

## Errors

Rejections are `FrontmailError` subclasses exported from this package: `NetworkError`,
`ValidationError`, `AuthError`, `InsufficientCreditsError`, `RateLimitError`, `BlockedError` – each with
`code`, `status`, `message`, `docsUrl` and `details`. Network errors, timeouts, `5xx` and `429` are retried
automatically with the same `Idempotency-Key`, so no email is sent twice.

## Turnstile

Put a Turnstile widget inside the form (`<div class="cf-turnstile" data-sitekey="…">` plus Cloudflare's
script). It adds a hidden `cf-turnstile-response` field which `sendForm` submits. For `send()` pass
`{ turnstileToken }`.

## Typed params

Run `npx frontmail types` (package `@frontmail/node`) to generate `frontmail-env.d.ts`; afterwards
`send('tpl_contact', params)` type-checks `params`.

## Size

`pnpm --filter @frontmail/browser size` fails the build when the UMD bundle exceeds 3 kB gzip.

MIT
