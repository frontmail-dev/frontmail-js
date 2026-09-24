import { afterEach, describe, expect, it } from 'vitest';
import { FrontmailError, NetworkError, _resetPublicConfigCache, getPublicConfig } from '../src';
import { jsonResponse, mockFetch } from './helpers';

const CONFIG = { turnstile: { mobileSiteKey: '0x4AAA', mobileBaseUrl: 'https://mobile.frontmail.dev' } };

afterEach(() => _resetPublicConfigCache());

describe('getPublicConfig', () => {
  it('fetches the config once per API URL', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, CONFIG));
    const [a, b] = await Promise.all([getPublicConfig('https://api.test/', fetch), getPublicConfig('https://api.test', fetch)]);
    expect(a).toEqual(CONFIG);
    expect(b).toBe(a);
    expect(await getPublicConfig('https://api.test', fetch)).toBe(a);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.test/v1/public-config');
    expect(calls[0]!.init.method).toBe('GET');

    await getPublicConfig('https://other.test', fetch);
    await getPublicConfig(undefined, fetch);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.test/v1/public-config',
      'https://other.test/v1/public-config',
      'https://api.frontmail.dev/v1/public-config',
    ]);
  });

  it('normalises missing values to null', async () => {
    const { fetch } = mockFetch(jsonResponse(200, { turnstile: { mobileSiteKey: null } }));
    expect(await getPublicConfig('https://api.test', fetch)).toEqual({ turnstile: { mobileSiteKey: null, mobileBaseUrl: null } });
  });

  it('does not cache failures', async () => {
    const { fetch, calls } = mockFetch(new TypeError('offline'), jsonResponse(503, { error: { code: 'service_unavailable' } }), jsonResponse(200, {}), jsonResponse(200, CONFIG));
    await expect(getPublicConfig('https://api.test', fetch)).rejects.toBeInstanceOf(NetworkError);
    await expect(getPublicConfig('https://api.test', fetch)).rejects.toMatchObject({ code: 'service_unavailable', status: 503 });
    const invalid = await getPublicConfig('https://api.test', fetch).catch((e: unknown) => e);
    expect(invalid).toBeInstanceOf(FrontmailError);
    expect(invalid).toMatchObject({ code: 'invalid_response' });
    expect(await getPublicConfig('https://api.test', fetch)).toEqual(CONFIG);
    expect(await getPublicConfig('https://api.test', fetch)).toEqual(CONFIG);
    expect(calls).toHaveLength(4);
  });
});
