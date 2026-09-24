# @frontmail/react-native

React Native (and Expo) bindings for [Frontmail](https://frontmail.dev): provider, a hook with send
status, AsyncStorage-backed client-side throttling and Cloudflare Turnstile in a WebView.

```sh
npx expo install @frontmail/react-native @react-native-async-storage/async-storage react-native-webview
# bare React Native: npm i @frontmail/react-native @react-native-async-storage/async-storage react-native-webview && npx pod-install
```

`@react-native-async-storage/async-storage` (persistent `limitRate`) and `react-native-webview`
(`<TurnstileWebView>`) are optional.

**Before the first send** enable **Security → Allow mobile apps** in the dashboard if you have
allowed websites set – native apps send no `Origin` header, so the allowlist would reject them.

```tsx
import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { FrontmailProvider, TurnstileWebView, useSendEmail } from '@frontmail/react-native';

const options = { publicKey: 'pk_…', limitRate: { id: 'contact', throttle: 30_000 } }; // keep stable

export default function App() {
  return (
    <FrontmailProvider options={options}>
      <Contact />
    </FrontmailProvider>
  );
}

function Contact() {
  const { send, status, error } = useSendEmail('svc_…', 'tpl_contact');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string>();
  return (
    <View>
      <TextInput value={message} onChangeText={setMessage} multiline />
      <TurnstileWebView siteKey="0x4AAA…" baseUrl="https://example.com" onToken={setToken} />
      <Button
        title="Send"
        disabled={status === 'sending'}
        onPress={() => send({ message }, { turnstileToken: token })}
      />
      {status === 'sent' && <Text>Thanks!</Text>}
      {error && <Text>{error.message}</Text>}
    </View>
  );
}
```

## API

- `<FrontmailProvider options? client?>` – creates a client (`publicKey`, `apiUrl`, `retry`,
  `timeoutMs`, `blockList`, `limitRate`, `storageProvider`, …) or uses the one you pass. Requests send
  `X-Frontmail-Client: @frontmail/react-native/<version>`.
- `useFrontmail()` – the client (`send`, `getStatus`, `request`).
- `useSendEmail(serviceId, templateId)` → `{ send(params, options?), getStatus(), status, error, result, reset }`.
  `status`: `idle → sending → sent | held | error`. `send` resolves with the result or `undefined` on
  error – it never rejects. `getStatus()` reads the delivery status of the last accepted message.
- `<TurnstileWebView siteKey baseUrl onToken onError? onExpire? theme? size? action? language? style?>` –
  renders the Turnstile widget in `react-native-webview` with `baseUrl` as the page URL. **The
  hostname of `baseUrl` must be in the site key's allowed hostnames** (Cloudflare dashboard →
  Turnstile → widget → Hostnames). Tokens are single use: call `ref.current.reset()` after a send.
- `asyncStorageProvider(AsyncStorage)`, `memoryStorageProvider()`, `defaultStorageProvider()` –
  storage for `limitRate`. The default uses AsyncStorage when installed, otherwise memory (with a
  development warning).

Retries (network, `5xx`, `429`) reuse one idempotency key per logical send. Idempotency keys are
UUID v4 – `crypto.randomUUID` when available, otherwise a `getRandomValues` / `Math.random` fallback
(Hermes has no `crypto` by default).

## Security

- Only ever use the **public** key in an app. A private key in an app bundle is public.
- With "Allow mobile apps" on, requests without an `Origin` header are accepted from anywhere – rely
  on the per-IP rate limit, Turnstile (required per template) and the block list.

## Typed params

```sh
FRONTMAIL_PRIVATE_KEY=sk_… npx frontmail types   # from @frontmail/node → frontmail-env.d.ts
```

The generated file augments `FrontmailTemplates` in `@frontmail/react-native`, so
`useSendEmail('svc', 'tpl_contact').send({...})` is type-checked.

Docs: [docs.frontmail.dev/sdks/react-native](https://docs.frontmail.dev/sdks/react-native/) · MIT
