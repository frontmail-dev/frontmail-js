const env = import.meta.env;

export const config = {
  publicKey: env.VITE_FRONTMAIL_PUBLIC_KEY || 'pk_test',
  apiUrl: env.VITE_FRONTMAIL_API_URL || undefined,
  serviceId: env.VITE_FRONTMAIL_SERVICE_ID || undefined,
  templateId: env.VITE_FRONTMAIL_TEMPLATE_ID || 'tpl_contact',
  turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY || undefined,
};
