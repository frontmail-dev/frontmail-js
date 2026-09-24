# @frontmail/vue

Vue 3 plugin, composables and a `<FrontmailForm>` component for [Frontmail](https://frontmail.dev).

```sh
npm i @frontmail/vue
```

```ts
import { createApp } from 'vue';
import { Frontmail } from '@frontmail/vue';

createApp(App).use(Frontmail, { publicKey: 'pk_…' }).mount('#app');
```

```vue
<script setup lang="ts">
import { FrontmailForm, useSendEmail, type SendResult } from '@frontmail/vue';

const { send, status, error, result, reset } = useSendEmail('svc_…', 'tpl_…');
const onSuccess = (r: SendResult) => console.log(r.messageId, r.status);
</script>

<template>
  <FrontmailForm
    service-id="svc_…"
    template-id="tpl_…"
    turnstile-site-key="0x4AAA…"
    @success="onSuccess"
  >
    <template #default="{ status, error }">
      <input name="email" type="email" required />
      <textarea name="message" required />
      <button :disabled="status === 'sending'">Send</button>
      <p v-if="error" role="alert">{{ error.message }}</p>
    </template>
  </FrontmailForm>
  <button @click="send({ email: 'jan@example.com' })">{{ status }}</button>
</template>
```

## API

- `app.use(Frontmail, options)` – provides a client (options as in `@frontmail/sdk-core`, or `{ client }`)
  and registers `<FrontmailForm>` globally (typed via `GlobalComponents`).
- `useFrontmail()` – the injected client.
- `useSendEmail(serviceId, templateId)` – ids may be refs/getters. Returns readonly refs `status`
  (`idle | sending | sent | held | error`), `error`, `result` plus `send(params)`, `sendForm(form)` and
  `reset()`. `send` resolves with the result or `undefined` on error.
- `<FrontmailForm>` props: `serviceId`, `templateId`, `turnstileSiteKey`, `turnstileOptions`,
  `sendOptions`, `resetOnSuccess` (default `true`); emits `success`, `error`, `status`; default slot
  props `{ status, error, result }`. Turnstile loads lazily and resets after each submit.
  `turnstileSiteKey` is **your own** Cloudflare Turnstile site key (create a widget in your Cloudflare
  account listing your site's hostnames, then enter the site key + secret in the dashboard under
  Security → Bot protection). Without it, templates requiring Turnstile fail with `captcha_not_configured`.

## Errors

`error` is a `FrontmailError` subclass (`NetworkError`, `ValidationError`, `AuthError`,
`InsufficientCreditsError`, `RateLimitError`, `BlockedError`) with `code`, `status`, `message`, `docsUrl`.

## Typed params

`FRONTMAIL_PRIVATE_KEY=sk_… npx frontmail types` (from `@frontmail/node`) augments `FrontmailTemplates`
in `@frontmail/vue`, so `useSendEmail('svc', 'tpl_contact').send({...})` is type-checked.

MIT
