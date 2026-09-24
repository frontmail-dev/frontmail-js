# @frontmail/react

React bindings for [Frontmail](https://frontmail.dev): provider, hooks with send status, and a
`<FrontmailForm>` with built-in Cloudflare Turnstile.

```sh
npm i @frontmail/react
```

```tsx
import { FrontmailProvider, FrontmailForm, useSendEmail } from '@frontmail/react';

const options = { publicKey: 'pk_…' }; // keep stable (module constant or useMemo)

export function App() {
  return (
    <FrontmailProvider options={options}>
      <FrontmailForm
        serviceId="svc_…"
        templateId="tpl_…"
        turnstileSiteKey="0x4AAA…" // optional
        onSuccess={(r) => console.log(r.messageId, r.status)}
        onError={(e) => console.error(e.code)}
      >
        {({ status, error }) => (
          <>
            <input name="email" type="email" required />
            <textarea name="message" required />
            <button disabled={status === 'sending'}>Send</button>
            {status === 'held' && <p>Accepted – will be delivered shortly.</p>}
            {error && <p role="alert">{error.message}</p>}
          </>
        )}
      </FrontmailForm>
    </FrontmailProvider>
  );
}

function Subscribe() {
  const { send, status, error, result, reset } = useSendEmail('svc_…', 'tpl_…');
  return <button onClick={() => send({ email: 'jan@example.com' })}>{status}</button>;
}
```

## API

- `<FrontmailProvider options? client?>` – creates a client (`publicKey`, `apiUrl`, `retry`, `timeoutMs`,
  `blockHeadless`, `blockList`, `limitRate`, …) or uses the one you pass.
- `useFrontmail()` – the client (`send`, `sendForm`, `getStatus`).
- `useSendEmail(serviceId, templateId)` → `{ send(params, options?), sendForm(form, options?), status, error, result, reset }`.
  `status`: `idle → sending → sent | held | error` (`sent` = accepted and queued, `held` = accepted and
  waiting for credits). `send` resolves with the result or `undefined` on error – it never rejects.
- `<FrontmailForm serviceId? templateId turnstileSiteKey? turnstileOptions? sendOptions? resetOnSuccess? onSuccess? onError?>` –
  renders a `<form>` (other props are passed through, `data-status` reflects the status). Children may be
  a render function receiving `{ status, error, result }`. The Turnstile script is loaded lazily and the
  widget is reset after each submit.
  `turnstileSiteKey` is **your own** Cloudflare Turnstile site key (create a widget in your Cloudflare
  account listing your site's hostnames, then enter the site key + secret in the dashboard under
  Security → Bot protection). Without it, templates requiring Turnstile fail with `captcha_not_configured`.

The entry is marked `'use client'` for React Server Components frameworks.

## Errors

`error` is always a `FrontmailError` (`NetworkError`, `ValidationError`, `AuthError`,
`InsufficientCreditsError`, `RateLimitError`, `BlockedError`) with `code`, `status`, `message`, `docsUrl`,
`details`. Retries (network, `5xx`, `429`) with a stable idempotency key happen before an error is reported.

## Typed params

```sh
FRONTMAIL_PRIVATE_KEY=sk_… npx frontmail types   # from @frontmail/node → frontmail-env.d.ts
```

The generated file augments `FrontmailTemplates` in `@frontmail/react`, so
`useSendEmail('svc', 'tpl_contact').send({...})` is type-checked.

MIT
