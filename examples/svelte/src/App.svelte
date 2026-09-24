<script lang="ts">
  import { FrontmailForm, createFrontmail, frontmailForm, setFrontmail } from '@frontmail/svelte';
  import { config } from './config';

  // One instance for the app; <FrontmailForm> picks it up from context.
  const frontmail = setFrontmail(createFrontmail({ publicKey: config.publicKey, apiUrl: config.apiUrl }));
  // A second instance with its own status store for the action-based form below.
  const quick = createFrontmail({ client: frontmail.client });
  const quickStatus = quick.status;

  let messageId = $state('');
  let actionStatus = $state('idle');
</script>

<main>
  <h1>Contact us (Svelte)</h1>
  <FrontmailForm
    serviceId={config.serviceId}
    templateId={config.templateId}
    turnstileSiteKey={config.turnstileSiteKey}
    onSuccess={(r) => (messageId = r.messageId)}
    data-testid="contact-form"
    class="form"
  >
    {#snippet children({ status, error })}
      <label>Name <input name="name" data-testid="name" required /></label>
      <label>Email <input name="email" type="email" data-testid="email" required /></label>
      <label>Message <textarea name="message" data-testid="message" required></textarea></label>
      <button type="submit" data-testid="submit" disabled={status === 'sending'}>Send</button>
      <p>Status: <strong data-testid="status">{status}</strong></p>
      <p data-testid="message-id">{messageId}</p>
      <p data-testid="error" role="alert" class="error">{error ? `${error.code}: ${error.message}` : ''}</p>
    {/snippet}
  </FrontmailForm>

  <section>
    <h2>Plain form with <code>use:frontmailForm</code></h2>
    <form
      class="form"
      data-testid="action-form"
      use:frontmailForm={{
        frontmail: quick,
        serviceId: config.serviceId,
        templateId: config.templateId,
        onState: (s) => (actionStatus = s.status),
      }}
    >
      <input name="name" value="Newsletter" type="hidden" />
      <input name="email" type="email" data-testid="quick-email" required />
      <input name="message" value="Please subscribe me." type="hidden" />
      <button type="submit" data-testid="quick-submit">Send</button>
      <p>Status: <strong data-testid="quick-status">{actionStatus}</strong></p>
    </form>
    <p>Store: {$quickStatus}</p>
  </section>
</main>

<style>
  main { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
  :global(.form) { display: grid; gap: 0.75rem; }
  .error { color: #b00020; }
</style>
