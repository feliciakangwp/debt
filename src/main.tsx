import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootEl = document.getElementById('root')!;

// Dynamically importing App (and everything it pulls in, including
// src/lib/supabaseClient.ts, which throws if the CDN <script> tag in
// index.html failed to load) means a failure here rejects this promise
// instead of crashing the whole page before React ever gets to render —
// so the error still reaches the user as a readable message.
import('./App.tsx')
  .then(({ default: App }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((e: unknown) => {
    const message = e instanceof Error ? e.message : 'Failed to load the app.';
    rootEl.innerHTML = `
      <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;background:#071D49;padding:16px;font-family:system-ui,sans-serif;">
        <div style="max-width:28rem;border-radius:0.5rem;background:#fff;padding:2rem;box-shadow:0 10px 25px rgba(0,0,0,0.2);">
          <div style="font-weight:700;color:#071D49;margin-bottom:0.75rem;">Couldn't load the app</div>
          <div style="font-size:0.875rem;color:#475569;">${message} Check your internet connection and reload the page.</div>
        </div>
      </div>
    `;
  });
