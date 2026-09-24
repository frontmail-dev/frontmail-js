<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLFormAttributes } from 'svelte/elements';
  import type { FrontmailError, SendOptions, SendResult, TurnstileRenderOptions } from '@frontmail/sdk-core';
  import { frontmailForm } from './action.js';
  import { IDLE, getFrontmail } from './frontmail.js';
  import type { FrontmailInstance, SendState } from './frontmail.js';

  interface Props extends Omit<HTMLFormAttributes, 'children' | 'onsubmit' | 'onerror'> {
    serviceId?: string | null;
    templateId: string;
    frontmail?: FrontmailInstance;
    turnstileSiteKey?: string;
    turnstileOptions?: Omit<TurnstileRenderOptions, 'sitekey'>;
    sendOptions?: SendOptions;
    resetOnSuccess?: boolean;
    onSuccess?: (result: SendResult) => void;
    onError?: (error: FrontmailError) => void;
    children?: Snippet<[SendState]>;
  }

  let {
    serviceId = null,
    templateId,
    frontmail,
    turnstileSiteKey,
    turnstileOptions,
    sendOptions,
    resetOnSuccess = true,
    onSuccess,
    onError,
    children,
    ...rest
  }: Props = $props();

  const fromContext = getFrontmail();
  let state: SendState = $state(IDLE);
</script>

<form
  {...rest}
  aria-busy={state.status === 'sending'}
  use:frontmailForm={{
    serviceId,
    templateId,
    frontmail: frontmail ?? fromContext,
    turnstileSiteKey,
    turnstileOptions,
    sendOptions,
    resetOnSuccess,
    onSuccess,
    onError,
    onState: (s) => (state = s),
  }}
>
  {@render children?.(state)}
</form>
