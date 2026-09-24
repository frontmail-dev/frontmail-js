# @frontmail/node

Server-side SDK for [Frontmail](https://frontmail.dev) using your **private key**: single and batch
sends, message status, history, templates – plus the `frontmail types` CLI.

```sh
npm i @frontmail/node
```

```ts
import { Frontmail } from '@frontmail/node';

const frontmail = new Frontmail({ privateKey: process.env.FRONTMAIL_PRIVATE_KEY }); // default: env FRONTMAIL_PRIVATE_KEY / FRONTMAIL_API_URL

const { messageId, status } = await frontmail.send({
  serviceId: 'svc_…', // optional → default service
  templateId: 'tpl_…',
  params: { name: 'Jan' },
  attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', contentBase64: '…' }],
});

const results = await frontmail.sendBatch([{ templateId: 'tpl_…', params: {} } /* … up to 100 */]);
for (const r of results) r.ok ? console.log(r.messageId, r.status) : console.error(r.error.code);

await frontmail.getMessage(messageId); // { status, events, … }

const page = await frontmail.history({ limit: 50, status: 'bounced' }); // one page: { items, nextCursor }
for await (const item of frontmail.history({ templateId: 'tpl_…' })) console.log(item.messageId); // all pages

await frontmail.templates.list(); // [{ templateId, name, params }]
```

Options: `privateKey`, `apiUrl`, `retry`, `timeoutMs`, `fetch`. Every send carries an `Idempotency-Key`
(override with `idempotencyKey`), and network errors / `5xx` / `429` are retried with exponential backoff.
`sendBatch` rejects more than 100 messages with a `ValidationError` and never throws for per-item errors.

## Errors

Throws `FrontmailError` subclasses (`NetworkError`, `ValidationError`, `AuthError`,
`InsufficientCreditsError`, `RateLimitError`) with `code`, `status`, `message`, `docsUrl`, `details`.

## `frontmail types`

```sh
FRONTMAIL_PRIVATE_KEY=sk_… npx frontmail types [--out frontmail-env.d.ts] [--api-url https://api.frontmail.dev] [--module @frontmail/react] [--stdout]
```

Fetches `GET /v1/templates` and writes one `<TemplateName>Params` interface per template
(`string`/`text`/`email`/`url`/`html`/`date` → `string`, `number`, `boolean`, `enum` → string-literal union,
`list` → `Array<{…}>`, optional unless required) plus a `FrontmailTemplates` augmentation for every
Frontmail SDK found in your `package.json` (or the `--module` list):

```ts
declare module '@frontmail/react' {
  interface FrontmailTemplates {
    "tpl_contact": ContactFormParams;
  }
}
```

Include the file in your `tsconfig` and `send('tpl_contact', params)` is checked at compile time.
The generator is also exported as `generateTypes(templates, { modules })`.

MIT
