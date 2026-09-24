import { FrontmailError, createClient } from '@frontmail/sdk-core';
import type { Client, ClientOptions } from '@frontmail/sdk-core';
import { createContext, createElement, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { version } from '../package.json';
import { defaultStorageProvider } from './storage';

export const CLIENT_NAME = '@frontmail/react-native/' + version;

const FrontmailContext = createContext<Client | null>(null);

export type FrontmailOptions = Omit<ClientOptions, 'clientName' | 'privateKey'>;

export interface FrontmailProviderProps {
  /**
   * Client options (`publicKey`, `apiUrl`, `retry`, `limitRate`, `storageProvider`…). Keep the object
   * stable (module constant or `useMemo`). Never put a private key into an app.
   */
  options?: FrontmailOptions;
  /** Use an existing client instead of creating one from `options`. */
  client?: Client;
  children?: ReactNode;
}

/** Creates the React Native client: RN client name + AsyncStorage-backed `limitRate` storage. */
export function createNativeClient(options: FrontmailOptions = {}): Client {
  return createClient({
    ...options,
    storageProvider: options.storageProvider ?? defaultStorageProvider(),
    clientName: CLIENT_NAME,
  });
}

/** Provides a Frontmail client to `useFrontmail` and `useSendEmail`. */
export function FrontmailProvider({ options, client, children }: FrontmailProviderProps) {
  const value = useMemo(() => client ?? createNativeClient(options), [client, options]);
  return createElement(FrontmailContext.Provider, { value }, children);
}

/** Returns the client from the nearest `<FrontmailProvider>`. */
export function useFrontmail(): Client {
  const client = useContext(FrontmailContext);
  if (!client) throw new FrontmailError('not_initialized', 'useFrontmail() must be used inside <FrontmailProvider>.');
  return client;
}
