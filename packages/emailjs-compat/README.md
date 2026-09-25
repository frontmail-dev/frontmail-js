# @frontmail/emailjs-compat

Drop-in replacement for `@emailjs/browser`, backed by [Frontmail](https://frontmail.dev). Same exports
(`init`, `send`, `sendForm`, `EmailJSResponseStatus`, default export) and call signatures – migrating
means changing the import and using your Frontmail ids.

```diff
- import emailjs from '@emailjs/browser';
+ import emailjs from '@frontmail/emailjs-compat';

  emailjs.init({ publicKey: 'pk_…' });
  await emailjs.send('svc_…', 'tpl_…', { name: 'Jan' });
  await emailjs.sendForm('svc_…', 'tpl_…', '#contact-form');
```

CDN (pin the version, keep `integrity`) – exposes the same `emailjs` global:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@frontmail/emailjs-compat@0.1.0/dist/emailjs-compat.umd.js"
  integrity="sha384-RH+fuNzBqTKgxDJBHRmWfOn37fs33L+Or1ujDV7wThynx9FxD9uPptLu80LpCrEc"
  crossorigin="anonymous"></script>
```

The hash of each release is in its [GitHub release notes](https://github.com/frontmail-dev/frontmail-js/releases).

## Behaviour

- `init(options | publicKey, origin = 'https://api.frontmail.dev')`; options: `publicKey` (or legacy
  `user_id`), `accessToken` (private key, server only), `blockHeadless`, `blockList`, `limitRate`,
  `storageProvider`. Per-call options (4th argument) override `init`.
- **`accessToken` must not be shipped to a browser.** EmailJS snippets often pass it in front-end
  code; with Frontmail a private key can read your message history. In a browser the package rejects
  it with `400` / `error.code === 'private_key_in_browser'` (opt-out for internal tools only:
  `dangerouslyAllowPrivateKeyInBrowser: true`). Use it only on a server.
- `sendForm` skips password inputs, anti-CSRF fields (`csrfmiddlewaretoken`, `_token`, …) and
  reserved names (`accessToken`, `privateKey`, `turnstile_key`).
- `blockHeadless`, `blockList` and `limitRate` run in the browser – a convenience, not security.
- Requests go to the EmailJS-compatible aliases `/api/v1.0/email/send` and `/api/v1.0/email/send-form`.
- Success resolves `EmailJSResponseStatus { status: 200, text: 'OK' }` plus Frontmail extras
  `messageId`, `deliveryStatus` (`queued` | `held`) and `statusToken`.
- Failures reject with `EmailJSResponseStatus { status, text }` (and `error`, the underlying
  `FrontmailError`): API errors keep their HTTP status and message, network errors are `0 'Network Error'`,
  `blockHeadless` → `451`, `blockList` → `403`, `limitRate` → `429`.
- On top of EmailJS you get automatic retries with idempotency keys and the hold queue: when credits
  run out, emails are accepted (`deliveryStatus: 'held'`) instead of being dropped.

For new code prefer [`@frontmail/browser`](../sdk-js/README.md), which exposes typed errors and statuses directly.

MIT
