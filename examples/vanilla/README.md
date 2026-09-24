# Frontmail example – vanilla JS

Contact form using `@frontmail/browser` in two flavours:

- `index.html` – ES module import (`import * as frontmail from '@frontmail/browser'`)
- `umd.html` – classic `<script src="frontmail.umd.js">` and the `window.frontmail` global
  (`scripts/copy-umd.mjs` copies the UMD build into `public/`; in production use the CDN)

The Turnstile widget (when a site key is set) injects `cf-turnstile-response` into the form, which
`sendForm` submits automatically.

Source: [`frontmail-dev/frontmail-js` → `examples/vanilla`](https://github.com/frontmail-dev/frontmail-js/tree/main/examples/vanilla).
The example uses the SDK from the same workspace, so install and build from the repository root first:

```sh
git clone https://github.com/frontmail-dev/frontmail-js.git && cd frontmail-js
corepack enable && pnpm install && pnpm build
```

Then:

```sh
pnpm --filter @frontmail/example-vanilla dev     # dev server
pnpm --filter @frontmail/example-vanilla build   # production build → dist/
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
