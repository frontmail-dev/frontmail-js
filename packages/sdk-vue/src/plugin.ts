import { FrontmailError, createClient } from '@frontmail/sdk-core';
import type { Client, ClientOptions } from '@frontmail/sdk-core';
import { inject } from 'vue';
import type { App, InjectionKey } from 'vue';
import { version } from '../package.json';
import { FrontmailForm } from './FrontmailForm';

export const CLIENT_NAME = '@frontmail/vue/' + version;

export const FrontmailKey: InjectionKey<Client> = Symbol('frontmail');

export type FrontmailOptions = Omit<ClientOptions, 'clientName'> & {
  /** Use an existing client instead of creating one. */
  client?: Client;
};

/** Vue plugin: `app.use(Frontmail, { publicKey })`. Also registers `<FrontmailForm>` globally. */
export const Frontmail = {
  install(app: App, options: FrontmailOptions = {}) {
    const { client, ...rest } = options;
    app.provide(FrontmailKey, client ?? createClient({ ...rest, clientName: CLIENT_NAME }));
    app.component('FrontmailForm', FrontmailForm);
  },
};

/** Returns the client provided by the plugin. */
export function useFrontmail(): Client {
  const client = inject(FrontmailKey, null);
  if (!client) throw new FrontmailError('not_initialized', 'Install the plugin first: app.use(Frontmail, { publicKey }).');
  return client;
}
