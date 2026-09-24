# Frontmail example – React Native (Expo)

Expo + TypeScript contact form using `<FrontmailProvider>`, the `useSendEmail` hook, AsyncStorage
throttling (`limitRate`) and Cloudflare Turnstile via `<TurnstileWebView>`.

Source: [`frontmail-dev/frontmail-js` → `examples/react-native`](https://github.com/frontmail-dev/frontmail-js/tree/main/examples/react-native).
The example uses the SDK from the same workspace, so install and build from the repository root first:

```sh
git clone https://github.com/frontmail-dev/frontmail-js.git && cd frontmail-js
corepack enable && pnpm install && pnpm build
```

Then:

```sh
pnpm --filter @frontmail/example-react-native start      # Expo dev server (press i / a, or scan the QR code in Expo Go)
pnpm --filter @frontmail/example-react-native typecheck
```

`metro.config.js` makes Metro resolve `react`, `react-native` and the native modules from this app,
so the linked workspace SDK doesn't pull in a second copy.

## Before the first send

Native apps don't send an `Origin` header. If your organization has **allowed websites** set, enable
**Security → Allow mobile apps** in the dashboard, otherwise the API answers `403 origin_not_allowed`.
Only ever use the **public** key in an app.

## Configuration

`EXPO_PUBLIC_*` variables are inlined when the bundle is built – put them in `.env.local` or pass them
on the command line, then restart `expo start`.

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_FRONTMAIL_PUBLIC_KEY` | public key `pk_…` (default `pk_test`) |
| `EXPO_PUBLIC_FRONTMAIL_API_URL` | API origin, e.g. `http://192.168.1.20:3000` for a local API (the device must reach it; default: production) |
| `EXPO_PUBLIC_FRONTMAIL_SERVICE_ID` | optional service id (empty → organization default) |
| `EXPO_PUBLIC_FRONTMAIL_TEMPLATE_ID` | template id (default `tpl_contact`, params `name`, `email`, `message`) |
| `EXPO_PUBLIC_FRONTMAIL_TURNSTILE_SITE_KEY` | optional Turnstile site key (`1x00000000000000000000AA` always passes) |
| `EXPO_PUBLIC_FRONTMAIL_TURNSTILE_BASE_URL` | page URL for the Turnstile WebView (default `https://example.com`); its hostname must be allowed for the site key |

Docs: [docs.frontmail.dev/sdks/react-native](https://docs.frontmail.dev/sdks/react-native/)
