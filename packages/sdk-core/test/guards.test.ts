import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedError, blockHeadless, blockList, isHeadlessBrowser, limitRate, localStorageProvider } from '../src';
import type { StorageProvider } from '../src';

const nav = (userAgent: string, webdriver = false) => ({ userAgent, webdriver }) as Navigator;

describe('blockHeadless', () => {
  it.each([
    ['Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36', false, true],
    ['Mozilla/5.0 PhantomJS/2.1.1', false, true],
    ['Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36', true, true],
    ['Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36', false, false],
  ])('%s webdriver=%s → %s', (ua, wd, expected) => {
    expect(isHeadlessBrowser(nav(ua, wd))).toBe(expected);
  });

  it('only throws when enabled', () => {
    expect(() => blockHeadless(false, nav('HeadlessChrome'))).not.toThrow();
    expect(() => blockHeadless(true, nav('HeadlessChrome'))).toThrow(BlockedError);
    expect(() => blockHeadless(true, nav('Firefox'))).not.toThrow();
  });

  it('handles a missing navigator', () => {
    expect(isHeadlessBrowser(undefined)).toBe(false);
  });
});

describe('blockList', () => {
  const opts = { list: ['Spam@Example.com', 'bot'], watchVariable: 'email' };
  it('blocks listed values case-insensitively', () => {
    expect(() => blockList(opts, () => 'spam@example.com ')).toThrow(BlockedError);
    try {
      blockList(opts, () => 'bot');
    } catch (e) {
      expect(e).toMatchObject({ code: 'recipient_blocked', status: 0, details: { watchVariable: 'email' } });
    }
  });
  it('ignores missing values, missing watchVariable and empty lists', () => {
    expect(() => blockList(opts, () => undefined)).not.toThrow();
    expect(() => blockList({ list: ['bot'] }, () => 'bot')).not.toThrow();
    expect(() => blockList({ list: [], watchVariable: 'email' }, () => 'bot')).not.toThrow();
    expect(() => blockList(undefined, () => 'bot')).not.toThrow();
    expect(() => blockList(opts, () => 'ok@example.com')).not.toThrow();
  });
});

describe('limitRate', () => {
  beforeEach(() => localStorage.clear());

  it('is a no-op without options', async () => {
    const record = await limitRate(undefined);
    await record();
    expect(localStorage.length).toBe(0);
  });

  it('throttles per id using localStorage', async () => {
    const t0 = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(t0);
    const record = await limitRate({ id: 'a', throttle: 5000 }, undefined, t0);
    await record();
    expect(localStorage.getItem('frontmail:limit-rate:a')).toBe(String(t0));
    await expect(limitRate({ id: 'a', throttle: 5000 }, undefined, t0 + 4999)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfter: 1,
    });
    await expect(limitRate({ id: 'b', throttle: 5000 }, undefined, t0 + 1)).resolves.toBeTypeOf('function');
    await expect(limitRate({ id: 'a', throttle: 5000 }, undefined, t0 + 5000)).resolves.toBeTypeOf('function');
    vi.restoreAllMocks();
  });

  it('defaults the id to location.pathname', async () => {
    const record = await limitRate({ throttle: 1000 });
    await record();
    expect(localStorage.getItem('frontmail:limit-rate:' + location.pathname)).toBeTruthy();
  });

  it('supports async storage providers', async () => {
    const map = new Map<string, string>();
    const storage: StorageProvider = {
      get: async (k) => map.get(k),
      set: async (k, v) => void map.set(k, v),
    };
    const record = await limitRate({ id: 'x', throttle: 1000 }, storage);
    await record();
    await expect(limitRate({ id: 'x', throttle: 1000 }, storage)).rejects.toBeInstanceOf(BlockedError);
  });

  it('survives throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(localStorageProvider.get('k')).toBeNull();
    expect(() => localStorageProvider.set('k', 'v')).not.toThrow();
    vi.restoreAllMocks();
  });
});
