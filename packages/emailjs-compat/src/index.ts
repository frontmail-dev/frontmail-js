/**
 * Drop-in replacement for `@emailjs/browser`: same exports and call signatures, backed by Frontmail.
 * Migration: change `import emailjs from '@emailjs/browser'` to `import emailjs from '@frontmail/emailjs-compat'`
 * and use your Frontmail public key / service / template ids.
 */
import { createClient, isFrontmailError } from '@frontmail/sdk-core';
import type { BlockListOptions, LimitRateOptions, SendResult, StorageProvider } from '@frontmail/sdk-core';
import { version } from '../package.json';

export const DEFAULT_ORIGIN = 'https://api.frontmail.dev';

export interface Options {
  /** Frontmail public key (`pk_…`). */
  publicKey?: string;
  /** Legacy alias of `publicKey`. */
  user_id?: string;
  /**
   * Private key (`sk_…`) – server-side only. In a browser this is refused (the key would be
   * readable by every visitor) unless `dangerouslyAllowPrivateKeyInBrowser` is set.
   */
  accessToken?: string;
  /** Allows `accessToken` in a browser (internal tools only). Default `false`. */
  dangerouslyAllowPrivateKeyInBrowser?: boolean;
  blockHeadless?: boolean;
  blockList?: BlockListOptions;
  limitRate?: LimitRateOptions;
  storageProvider?: StorageProvider;
}

/** Response / error object with the same shape as EmailJS (`status`, `text`). */
export class EmailJSResponseStatus {
  status: number;
  text: string;
  /** Frontmail extras (set on success). */
  messageId?: string;
  /** `queued` or `held` (accepted, waiting for credits). */
  deliveryStatus?: 'queued' | 'held';
  statusToken?: string;
  /** The underlying Frontmail error (set on failure). */
  error?: unknown;

  constructor(status = 0, text = 'Network Error') {
    this.status = status;
    this.text = text;
  }
}

let initOptions: Options = {};
let origin = DEFAULT_ORIGIN;

/** Stores default options (or the public key string) and an optional API origin. */
export function init(options: Options | string, apiOrigin: string = DEFAULT_ORIGIN): void {
  initOptions = typeof options == 'string' ? { publicKey: options } : { ...options };
  origin = apiOrigin;
}

const merge = (o?: Options | string): Options => ({
  ...initOptions,
  ...(typeof o == 'string' ? { publicKey: o } : o),
});

const toStatus = (e: unknown): EmailJSResponseStatus => {
  let res: EmailJSResponseStatus;
  if (!isFrontmailError(e)) res = new EmailJSResponseStatus(0, String(e));
  else if (e.code == 'headless_blocked' && !e.status) res = new EmailJSResponseStatus(451, 'Unavailable For Headless Browser');
  else if (e.code == 'recipient_blocked' && !e.status) res = new EmailJSResponseStatus(403, 'Forbidden');
  else if (e.code == 'rate_limited' && !e.status) res = new EmailJSResponseStatus(429, 'Too Many Requests');
  else res = new EmailJSResponseStatus(e.status, e.status ? e.message : 'Network Error');
  res.error = e;
  return res;
};

async function run(o: Options, fn: (client: ReturnType<typeof createClient>) => Promise<SendResult>) {
  const publicKey = o.publicKey || o.user_id;
  if (!publicKey && !o.accessToken) {
    throw new EmailJSResponseStatus(400, 'The public key is required. Pass it to init() or to the options argument.');
  }
  let client: ReturnType<typeof createClient>;
  try {
    client = createClient({
      apiUrl: origin,
      publicKey,
      privateKey: o.accessToken,
      dangerouslyAllowPrivateKeyInBrowser: o.dangerouslyAllowPrivateKeyInBrowser,
      blockHeadless: o.blockHeadless,
      blockList: o.blockList,
      limitRate: o.limitRate,
      storageProvider: o.storageProvider,
      clientName: '@frontmail/emailjs-compat/' + version,
      paths: { send: '/api/v1.0/email/send', sendForm: '/api/v1.0/email/send-form' },
    });
  } catch (e) {
    // `private_key_in_browser`: reject like any other EmailJS error.
    const res = new EmailJSResponseStatus(400, e instanceof Error ? e.message : String(e));
    res.error = e;
    throw res;
  }
  try {
    const r = await fn(client);
    const res = new EmailJSResponseStatus(200, 'OK');
    res.messageId = r.messageId;
    res.deliveryStatus = r.status;
    res.statusToken = r.statusToken;
    return res;
  } catch (e) {
    throw toStatus(e);
  }
}

/** Sends a template with params. Resolves with `{ status: 200, text: 'OK' }`, rejects with `{ status, text }`. */
export function send(
  serviceID: string,
  templateID: string,
  templateParams?: Record<string, unknown>,
  options?: Options | string,
): Promise<EmailJSResponseStatus> {
  return run(merge(options), (c) => c.send(serviceID, templateID, templateParams));
}

/** Sends a form element (or CSS selector) including file inputs. */
export function sendForm(
  serviceID: string,
  templateID: string,
  form: string | HTMLFormElement,
  options?: Options | string,
): Promise<EmailJSResponseStatus> {
  return run(merge(options), (c) => c.sendForm(serviceID, templateID, form));
}

export default { init, send, sendForm, EmailJSResponseStatus };
