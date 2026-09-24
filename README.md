# Frontmail JavaScript SDKs

Send email straight from your frontend – without running a backend. This repository contains the
official JavaScript / TypeScript SDKs for [Frontmail](https://frontmail.dev) and runnable examples
for every framework.

**Documentation:** [docs.frontmail.dev](https://docs.frontmail.dev)

## Packages

| Package                                                | Use it for                                                                       | npm                                                                                                                       | Docs                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`@frontmail/browser`](packages/sdk-js)                | Plain JS / any framework in the browser (ESM + UMD/CDN build)                    | [![npm](https://img.shields.io/npm/v/@frontmail/browser)](https://www.npmjs.com/package/@frontmail/browser)               | [Browser SDK](https://docs.frontmail.dev/sdks/browser/)                           |
| [`@frontmail/react`](packages/sdk-react)               | React 18+: `FrontmailProvider`, `useSendEmail`, `<FrontmailForm>`                | [![npm](https://img.shields.io/npm/v/@frontmail/react)](https://www.npmjs.com/package/@frontmail/react)                   | [React](https://docs.frontmail.dev/sdks/react/)                                   |
| [`@frontmail/react-native`](packages/sdk-react-native) | React Native / Expo: `useSendEmail`, AsyncStorage `limitRate`, Turnstile WebView | [![npm](https://img.shields.io/npm/v/@frontmail/react-native)](https://www.npmjs.com/package/@frontmail/react-native)     | [React Native](https://docs.frontmail.dev/sdks/react-native/)                     |
| [`@frontmail/vue`](packages/sdk-vue)                   | Vue 3 plugin, composables and `<FrontmailForm>`                                  | [![npm](https://img.shields.io/npm/v/@frontmail/vue)](https://www.npmjs.com/package/@frontmail/vue)                       | [Vue](https://docs.frontmail.dev/sdks/vue/)                                       |
| [`@frontmail/svelte`](packages/sdk-svelte)             | Svelte 5 stores, `use:frontmailForm` action, `<FrontmailForm>`                   | [![npm](https://img.shields.io/npm/v/@frontmail/svelte)](https://www.npmjs.com/package/@frontmail/svelte)                 | [Svelte](https://docs.frontmail.dev/sdks/svelte/)                                 |
| [`@frontmail/node`](packages/sdk-node)                 | Server side with a private key: send, batch, history, `frontmail types` CLI      | [![npm](https://img.shields.io/npm/v/@frontmail/node)](https://www.npmjs.com/package/@frontmail/node)                     | [Node.js](https://docs.frontmail.dev/sdks/node/)                                  |
| [`@frontmail/emailjs-compat`](packages/emailjs-compat) | Drop-in replacement for `@emailjs/browser` – migrate by changing the import      | [![npm](https://img.shields.io/npm/v/@frontmail/emailjs-compat)](https://www.npmjs.com/package/@frontmail/emailjs-compat) | [EmailJS compatibility](https://docs.frontmail.dev/sdks/emailjs-compat/)          |
| [`@frontmail/sdk-core`](packages/sdk-core)             | Zero-dependency isomorphic core used by all of the above                         | [![npm](https://img.shields.io/npm/v/@frontmail/sdk-core)](https://www.npmjs.com/package/@frontmail/sdk-core)             | [Retries & idempotency](https://docs.frontmail.dev/sdks/retries-and-idempotency/) |

All packages are versioned together and ship ESM with TypeScript types.

## Quick start

```sh
npm i @frontmail/browser
```

```ts
import * as frontmail from '@frontmail/browser';

frontmail.init({ publicKey: 'pk_…' });
await frontmail.sendForm('svc_…', 'tpl_…', '#contact-form');
```

Or without a bundler:

```html
<script src="https://cdn.jsdelivr.net/npm/@frontmail/browser/dist/frontmail.umd.js"></script>
```

See the [getting started guide](https://docs.frontmail.dev/getting-started/quickstart/) for creating
a service, a template and your public key.

## Examples

| Example                                          | Stack                                           |
| ------------------------------------------------ | ----------------------------------------------- |
| [`examples/vanilla`](examples/vanilla)           | Plain HTML + `@frontmail/browser` (ESM and UMD) |
| [`examples/react`](examples/react)               | Vite + React + `@frontmail/react`               |
| [`examples/react-native`](examples/react-native) | Expo + React Native + `@frontmail/react-native` |
| [`examples/vue`](examples/vue)                   | Vite + Vue 3 + `@frontmail/vue`                 |
| [`examples/svelte`](examples/svelte)             | Vite + Svelte 5 + `@frontmail/svelte`           |
| [`examples/node`](examples/node)                 | Node.js + `@frontmail/node`                     |

```sh
git clone https://github.com/frontmail-dev/frontmail-js.git
cd frontmail-js
corepack enable
pnpm install
pnpm build                                        # builds the SDKs the examples link to
pnpm --filter @frontmail/example-react dev
```

## Development

Requirements: Node.js 22+, pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm build       # all packages (dependency order)
pnpm test
pnpm typecheck
```

This repository is a **read-only mirror** – see [CONTRIBUTING.md](CONTRIBUTING.md). Releases are
published to npm from here by GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## License

[MIT](LICENSE)
