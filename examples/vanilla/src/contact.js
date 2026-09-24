// Shared by the ESM (index.html) and UMD (umd.html) pages. `sdk` is either the ES module
// namespace of @frontmail/browser or the global `window.frontmail` from the UMD build.
const env = import.meta.env;

export const config = {
  publicKey: env.VITE_FRONTMAIL_PUBLIC_KEY || 'pk_test',
  apiUrl: env.VITE_FRONTMAIL_API_URL || undefined,
  serviceId: env.VITE_FRONTMAIL_SERVICE_ID || undefined,
  templateId: env.VITE_FRONTMAIL_TEMPLATE_ID || 'tpl_contact',
  turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY || undefined,
};

function loadTurnstile(container, siteKey) {
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  // The widget adds a hidden `cf-turnstile-response` input to the form; sendForm submits it.
  script.onload = () => window.turnstile.render(container, { sitekey: siteKey });
  document.head.appendChild(script);
}

export function setupContactForm(sdk) {
  sdk.init({ publicKey: config.publicKey, apiUrl: config.apiUrl });

  const form = document.getElementById('contact-form');
  const status = document.getElementById('status');
  const messageId = document.getElementById('message-id');
  const error = document.getElementById('error');
  if (config.turnstileSiteKey) loadTurnstile(document.getElementById('turnstile'), config.turnstileSiteKey);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'sending';
    error.textContent = '';
    messageId.textContent = '';
    form.querySelector('button').disabled = true;
    try {
      const result = await sdk.sendForm(config.serviceId, config.templateId, form);
      // "queued" → accepted and on its way; "held" → accepted, waiting for credits.
      status.textContent = result.status === 'held' ? 'held' : 'sent';
      messageId.textContent = result.messageId;
      form.reset();
    } catch (err) {
      status.textContent = 'error';
      error.textContent = err.code ? `${err.code}: ${err.message}` : String(err);
    } finally {
      form.querySelector('button').disabled = false;
      window.turnstile?.reset();
    }
  });
}
