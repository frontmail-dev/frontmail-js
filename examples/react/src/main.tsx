import { FrontmailProvider } from '@frontmail/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { config } from './config';

// Keep the options object stable (module constant) so the client is created once.
const options = { publicKey: config.publicKey, apiUrl: config.apiUrl };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontmailProvider options={options}>
      <App />
    </FrontmailProvider>
  </StrictMode>,
);
