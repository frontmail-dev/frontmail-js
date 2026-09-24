import { BlockedError } from './errors';
import type { BlockListOptions, LimitRateOptions, StorageProvider } from './types';

/** Heuristic detection of automated / headless browsers. */
export function isHeadlessBrowser(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  return nav.webdriver === true || /headless|phantom|slimer|puppeteer|playwright/i.test(nav.userAgent || '');
}

/** Throws `BlockedError('headless_blocked')` when `enabled` and the browser looks automated. */
export function blockHeadless(enabled: boolean | undefined, nav?: Navigator): void {
  if (enabled && isHeadlessBrowser(nav)) {
    throw new BlockedError('headless_blocked', 'Headless browsers are blocked.');
  }
}

const norm = (v: unknown) => String(v).trim().toLowerCase();

/** Throws `BlockedError('recipient_blocked')` when the watched value is on the block list. */
export function blockList(options: BlockListOptions | undefined, lookup: (name: string) => unknown): void {
  const name = options?.watchVariable;
  if (!name || !options.list?.length) return;
  const value = lookup(name);
  if (value == null || value === '') return;
  const blocked = options.list.map(norm);
  if (blocked.includes(norm(value))) {
    throw new BlockedError('recipient_blocked', name + ' is blocked.', {
      details: { watchVariable: name },
    });
  }
}

/** `localStorage` wrapped so it never throws (private mode, SSR, disabled storage). */
export const localStorageProvider: StorageProvider = {
  get(key) {
    try {
      return globalThis.localStorage?.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // storage unavailable – throttling degrades to a no-op
    }
  },
};

const rateKey = (o: LimitRateOptions) =>
  'frontmail:limit-rate:' + (o.id || globalThis.location?.pathname || 'default');

/**
 * Client-side throttle: at most one accepted send per `throttle` ms per bucket id.
 * Returns a function that records a successful send (call it after the API accepted the message).
 */
export async function limitRate(
  options: LimitRateOptions | undefined,
  storage: StorageProvider = localStorageProvider,
  now = Date.now(),
): Promise<() => Promise<void>> {
  if (!options || !(options.throttle > 0)) return async () => {};
  const key = rateKey(options);
  const last = Number(await storage.get(key));
  if (last && now - last < options.throttle) {
    throw new BlockedError('rate_limited', 'Too many requests.', {
      retryAfter: Math.ceil((options.throttle - (now - last)) / 1000),
    });
  }
  return async () => {
    await storage.set(key, String(Date.now()));
  };
}
