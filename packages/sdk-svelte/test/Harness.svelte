<script lang="ts">
  import { FrontmailForm, setFrontmail } from '../src/index';
  import type { FrontmailInstance, SendResult, FrontmailError } from '../src/index';

  let {
    frontmail,
    turnstileSiteKey,
    onSuccess,
    onError,
  }: {
    frontmail: FrontmailInstance;
    turnstileSiteKey?: string;
    onSuccess?: (r: SendResult) => void;
    onError?: (e: FrontmailError) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  setFrontmail(frontmail);
</script>

<FrontmailForm serviceId="svc" templateId="tpl" {turnstileSiteKey} {onSuccess} {onError} data-testid="form">
  {#snippet children({ status, error })}
    <input name="email" value="a@b.cz" data-testid="email" />
    <button type="submit">Send</button>
    <p data-testid="status">{status}{error ? ':' + error.code : ''}</p>
  {/snippet}
</FrontmailForm>
