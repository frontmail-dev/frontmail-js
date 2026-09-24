import { FrontmailError, createClient } from '@frontmail/sdk-core';
import type { Client, ClientOptions } from '@frontmail/sdk-core';
import { createContext, createElement, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { version } from '../package.json';

export const CLIENT_NAME = '@frontmail/react/' + version;

const FrontmailContext = createContext<Client | null>(null);

export type FrontmailOptions = Omit<ClientOptions, 'clientName'>;

export interface FrontmailProviderProps {
  /** Client options (`publicKey`, `apiUrl`, guards, retry…). Keep the object stable (module constant or `useMemo`). */
  options?: FrontmailOptions;
  /** Use an existing client instead of creating one from `options`. */
  client?: Client;
  children?: ReactNode;
}

/** Provides a Frontmail client to `useFrontmail`, `useSendEmail` and `<FrontmailForm>`. */
export function FrontmailProvider({ options, client, children }: FrontmailProviderProps) {
  const value = useMemo(() => client ?? createClient({ ...options, clientName: CLIENT_NAME }), [client, options]);
  return createElement(FrontmailContext.Provider, { value }, children);
}

/** Returns the client from the nearest `<FrontmailProvider>`. */
export function useFrontmail(): Client {
  const client = useContext(FrontmailContext);
  if (!client) throw new FrontmailError('not_initialized', 'useFrontmail() must be used inside <FrontmailProvider>.');
  return client;
}
