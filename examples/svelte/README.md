# Frontmail example – Svelte

Vite + Svelte 5 contact form using `createFrontmail`, `<FrontmailForm>` (with Turnstile) and the
`use:frontmailForm` action on a plain form (`data-testid="quick-*"`).

Source: [`frontmail-dev/frontmail-js` → `examples/svelte`](https://github.com/frontmail-dev/frontmail-js/tree/main/examples/svelte).
The example uses the SDK from the same workspace, so install and build from the repository root first:

```sh
git clone https://github.com/frontmail-dev/frontmail-js.git && cd frontmail-js
corepack enable && pnpm install && pnpm build
```

Then:

```sh
pnpm --filter @frontmail/example-svelte dev     # dev server
pnpm --filter @frontmail/example-svelte build   # production build → dist/
```

## Configuration

| Variable | Description |
|---|---|
| `VITE_FRONTMAIL_PUBLIC_KEY` | public key `pk_…` (default `pk_test`) |
| `VITE_FRONTMAIL_API_URL` | API origin, e.g. `http://localhost:3000` for a local API (default: production) |
| `VITE_FRONTMAIL_SERVICE_ID` | optional service id (empty → organization default) |
| `VITE_FRONTMAIL_TEMPLATE_ID` | template id (default `tpl_contact`, params `name`, `email`, `message`) |
| `VITE_TURNSTILE_SITE_KEY` | optional Turnstile site key (`1x00000000000000000000AA` always passes) |

Put them in `.env.local` or pass them on the command line. Test hooks for the E2E suite: inputs
`name` / `email` / `message` (`data-testid` equal to the name), `data-testid="submit"`, and
`data-testid="status"` showing `idle | sending | sent | held | error`, plus `message-id` and `error`.
