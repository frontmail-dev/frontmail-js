# Frontmail example – Node.js

Script using `@frontmail/node`: single send, batch send (3 messages), message status and paginated
history (`for await`).

Source: [`frontmail-dev/frontmail-js` → `examples/node`](https://github.com/frontmail-dev/frontmail-js/tree/main/examples/node).
The example uses the SDK from the same workspace, so install and build from the repository root first:

```sh
git clone https://github.com/frontmail-dev/frontmail-js.git && cd frontmail-js
corepack enable && pnpm install && pnpm build
```

Then:

```sh
pnpm --filter @frontmail/example-node build
FRONTMAIL_PRIVATE_KEY=sk_… FRONTMAIL_API_URL=http://localhost:3000 FRONTMAIL_TEMPLATE_ID=tpl_… \
  FRONTMAIL_TO=you@example.com pnpm --filter @frontmail/example-node start
```

| Variable | Description |
|---|---|
| `FRONTMAIL_PRIVATE_KEY` | private key `sk_…` (required) |
| `FRONTMAIL_API_URL` | API origin (default production) |
| `FRONTMAIL_SERVICE_ID` | optional service id |
| `FRONTMAIL_TEMPLATE_ID` | template id (default `tpl_contact`, params `name`, `email`, `message`) |
| `FRONTMAIL_TO` | value for the `email` param |

`pnpm --filter @frontmail/example-node types` runs `frontmail types` and writes
`src/frontmail-env.d.ts`, after which `send()` params are type-checked.
