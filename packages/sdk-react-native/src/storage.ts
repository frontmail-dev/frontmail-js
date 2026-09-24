import type { StorageProvider } from '@frontmail/sdk-core';
import { devWarn, optional } from './optional';
import type { AsyncStorageLike } from './optional';

/** Wraps AsyncStorage (or any compatible store); storage errors never break sending. */
export function asyncStorageProvider(storage: AsyncStorageLike): StorageProvider {
  return {
    async get(key) {
      try {
        return await storage.getItem(key);
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        await storage.setItem(key, value);
      } catch {
        // storage unavailable – throttling degrades to in-session only
      }
    },
  };
}

/** In-memory storage: `limitRate` works until the app is restarted. */
export function memoryStorageProvider(): StorageProvider {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
  };
}

/**
 * Default storage for `limitRate`: `@react-native-async-storage/async-storage` when installed,
 * otherwise in-memory (with a development warning). Resolved on first use, so apps that don't use
 * `limitRate` never load AsyncStorage or see the warning.
 */
export function defaultStorageProvider(): StorageProvider {
  let resolved: StorageProvider | undefined;
  const get = () => {
    if (!resolved) {
      const asyncStorage = optional.asyncStorage();
      if (asyncStorage) resolved = asyncStorageProvider(asyncStorage);
      else {
        devWarn(
          'limitRate: @react-native-async-storage/async-storage is not installed – throttling is kept in memory ' +
            'and resets when the app restarts. Install it or pass `storageProvider`.',
        );
        resolved = memoryStorageProvider();
      }
    }
    return resolved;
  };
  return {
    get: (key) => get().get(key),
    set: (key, value) => get().set(key, value),
  };
}
