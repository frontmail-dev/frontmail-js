# @frontmail/svelte

Svelte 5 helpers for [Frontmail](https://frontmail.dev): `createFrontmail()` with status stores, the
`use:frontmailForm` action and a `<FrontmailForm>` component with Turnstile.

```sh
npm i @frontmail/svelte
```

```svelte
<script lang="ts">
  import { createFrontmail, setFrontmail, frontmailForm, FrontmailForm } from '@frontmail/svelte';

  const frontmail = setFrontmail(createFrontmail({ publicKey: 'pk_…' }));
  const { status } = frontmail; // Readable<'idle' | 'sending' | 'sent' | 'held' | 'error'>
</script>

<!-- Component -->
<FrontmailForm serviceId="svc_…" templateId="tpl_…" turnstileSiteKey="0x4AAA…" onSuccess={(r) => console.log(r.messageId)}>
  {#snippet children({ status, error })}
    <input name="email" type="email" required />
    <button disabled={status === 'sending'}>Send</button>
    {#if error}<p role="alert">{error.message}</p>{/if}
  {/snippet}
</FrontmailForm>

<!-- Action on a plain form -->
<form use:frontmailForm={{ frontmail, serviceId: 'svc_…', templateId: 'tpl_…', onSuccess: (r) => console.log(r) }}>
  <input name="email" type="email" required />
  <button>Send ({$status})</button>
</form>
```

## API

- `createFrontmail(options)` → `{ client, state, status, send(serviceId, templateId, params), sendForm(serviceId, templateId, form), getStatus, track, reset }`.
  `state` is a store with `{ status, error, result }`; `status` a derived store. `send`/`sendForm`
  resolve with the result or `undefined` on error. The first instance becomes the default for the action.
- `setFrontmail(instance)` / `getFrontmail()` – context helpers (`<FrontmailForm>` reads the context).
- `use:frontmailForm={{ serviceId?, templateId, frontmail?, turnstileSiteKey?, turnstileOptions?, sendOptions?, resetOnSuccess?, onSuccess?, onError?, onState? }}` –
  submits the form via `sendForm`, mirrors the status in `data-status` and updates the instance stores.
- `<FrontmailForm>` – props as above plus any `<form>` attribute; `children` snippet receives
  `{ status, error, result }`.

Status values: `idle → sending → sent | held | error` (`sent` = accepted/queued, `held` = accepted and
waiting for credits).

## Errors

`error` is a `FrontmailError` subclass (`NetworkError`, `ValidationError`, `AuthError`,
`InsufficientCreditsError`, `RateLimitError`, `BlockedError`) with `code`, `status`, `message`, `docsUrl`.

## Typed params

`FRONTMAIL_PRIVATE_KEY=sk_… npx frontmail types` (from `@frontmail/node`) augments `FrontmailTemplates`
in `@frontmail/svelte`, so `frontmail.send('svc', 'tpl_contact', {...})` is type-checked.

MIT
