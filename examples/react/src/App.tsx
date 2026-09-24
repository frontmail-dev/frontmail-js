import { FrontmailForm, useSendEmail } from '@frontmail/react';
import { useState } from 'react';
import { config } from './config';

export function App() {
  const [messageId, setMessageId] = useState('');
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '32rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Contact us (React)</h1>
      <FrontmailForm
        serviceId={config.serviceId}
        templateId={config.templateId}
        turnstileSiteKey={config.turnstileSiteKey}
        onSuccess={(result) => setMessageId(result.messageId)}
        data-testid="contact-form"
        style={{ display: 'grid', gap: '0.75rem' }}
      >
        {({ status, error }) => (
          <>
            <label>
              Name <input name="name" data-testid="name" required />
            </label>
            <label>
              Email <input name="email" type="email" data-testid="email" required />
            </label>
            <label>
              Message <textarea name="message" data-testid="message" required />
            </label>
            <button type="submit" data-testid="submit" disabled={status === 'sending'}>
              Send
            </button>
            <p>
              Status: <strong data-testid="status">{status}</strong>
            </p>
            <p data-testid="message-id">{messageId}</p>
            <p data-testid="error" role="alert" style={{ color: '#b00020' }}>
              {error ? `${error.code}: ${error.message}` : ''}
            </p>
          </>
        )}
      </FrontmailForm>
      <Newsletter />
    </main>
  );
}

/** The hook API: send params from any UI without a <form>. */
function Newsletter() {
  const { send, status, error } = useSendEmail(config.serviceId, config.templateId);
  const [email, setEmail] = useState('');
  return (
    <section>
      <h2>Quick message (useSendEmail)</h2>
      <input value={email} onChange={(e) => setEmail(e.target.value)} name="quick-email" data-testid="quick-email" />
      <button
        type="button"
        data-testid="quick-submit"
        onClick={() => void send({ name: 'Newsletter', email, message: 'Please subscribe me.' })}
      >
        Send
      </button>
      <p>
        Status: <strong data-testid="quick-status">{status}</strong> {error?.code}
      </p>
    </section>
  );
}
