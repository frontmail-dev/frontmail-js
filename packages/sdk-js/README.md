# @frontmail/browser

Send emails straight from the browser with [Frontmail](https://frontmail.dev). EmailJS-style API,
**< 3.5 kB gzip**, automatic retries with idempotency keys, typed errors and Turnstile support.

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
<script
  src="https://cdn.jsdelivr.net/npm/@frontmail/browser@0.1.0/dist/frontmail.umd.js"
  integrity="sha384-g2Rxznkz2yb/YYSdVTkXLxZFZ2Nh2+XdhPStxh0stydXFF3gYjDuyHimWIZLJDCc"
  crossorigin="anonymous"></script>
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

Always pin an exact version and keep `integrity` (Subresource Integrity): the hash of each release
is in its [GitHub release notes](https://github.com/frontmail-dev/frontmail-js/releases) and in
`https://cdn.frontmail.dev/v<version>/sri.json`. Unversioned URLs serve whatever is newest and can't
use SRI – avoid them in production.

## Options (`init`)

`publicKey`, `apiUrl` (default `https://api.frontmail.dev`), `retry` (`{ retries: 3, baseDelayMs: 300, maxDelayMs: 10000 }` or
`false`), `timeoutMs` (15000), `blockHeadless`, `blockList: { list, watchVariable }`,
`limitRate: { id?, throttle }`, `storageProvider`, `fetch`. Details: [`@frontmail/sdk-core`](../sdk-core/README.md).

**Never put a private key (`sk_…`) in a web page.** `init({ privateKey })` throws
`private_key_in_browser` in a browser (opt-out for internal tools only:
`dangerouslyAllowPrivateKeyInBrowser: true`). `blockHeadless`, `blockList` and `limitRate` are
client-side conveniences, not security – enforce limits in the dashboard (**Security**).

## Errors

Rejections are `FrontmailError` subclasses exported from this package: `NetworkError`,
`ValidationError`, `AuthError`, `InsufficientCreditsError`, `RateLimitError`, `BlockedError` – each with
`code`, `status`, `message`, `docsUrl` and `details`. Network errors, timeouts, `5xx` and `429` are retried
automatically with the same `Idempotency-Key`, so no email is sent twice.

## Turnstile

Put a Turnstile widget inside the form (`<div class="cf-turnstile" data-sitekey="…">` plus Cloudflare's
script). It adds a hidden `cf-turnstile-response` field which `sendForm` submits. For `send()` pass
`{ turnstileToken }`.

Use **your own** Turnstile site key: create a widget in your Cloudflare account (listing your site's
hostnames) and enter its site key + secret in the dashboard under **Security → Bot protection**.
Templates requiring Turnstile without configured keys fail with `403 captcha_not_configured`.

## Typed params

Run `npx frontmail types` (package `@frontmail/node`) to generate `frontmail-env.d.ts`; afterwards
`send('tpl_contact', params)` type-checks `params`.

## Size

`pnpm --filter @frontmail/browser size` fails the build when the UMD bundle exceeds 3.5 kB gzip.

MIT
