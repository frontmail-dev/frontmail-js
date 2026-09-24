import { DEFAULT_API_URL } from './client';
import { FrontmailError, NetworkError, errorFromResponse } from './errors';

/** Response of `GET /v1/public-config` (no key required, cacheable). */
export interface PublicConfig {
  turnstile: {
    /** Site key of Frontmail's shared Turnstile widget for native apps; `null` when not configured. */
    mobileSiteKey: string | null;
    /** Page URL the shared widget runs on (`https://mobile.<domain>`); `null` when not configured. */
    mobileBaseUrl: string | null;
  };
}

const cache = new Map<string, Promise<PublicConfig>>();

/**
 * Fetches the public configuration of a Frontmail API (`GET <apiUrl>/v1/public-config`). The result
 * is cached in memory per API URL for the lifetime of the JS context; a failed request is not
 * cached, so the next call retries.
 */
export function getPublicConfig(apiUrl?: string, fetchFn?: typeof fetch): Promise<PublicConfig> {
  const base = (apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
  let p = cache.get(base);
  if (!p) {
    p = load(base, fetchFn ?? globalThis.fetch);
    cache.set(base, p);
    p.catch(() => cache.get(base) === p && cache.delete(base));
  }
  return p;
}

async function load(base: string, fetchFn: typeof fetch): Promise<PublicConfig> {
  let res: Response;
  try {
    res = await fetchFn(base + '/v1/public-config', { method: 'GET' });
  } catch (e) {
    throw new NetworkError('network_error', 'Network request failed.', { cause: e });
  }
  const data = (await res.json().catch(() => null)) as Partial<PublicConfig> | null;
  if (!res.ok) throw errorFromResponse(res.status, data);
  const t = data?.turnstile;
  if (!t || typeof t != 'object') throw new FrontmailError('invalid_response', 'Unexpected API response.');
  return { turnstile: { mobileSiteKey: t.mobileSiteKey || null, mobileBaseUrl: t.mobileBaseUrl || null } };
}

/** Clears the `getPublicConfig` cache (tests). */
export function _resetPublicConfigCache(): void {
  cache.clear();
}
