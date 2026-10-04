import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react";
import { installHttpDebug } from './utils/httpDebug';
// Side-effect import: initialises i18next before any component can call
// useTranslation. LocaleProvider sets the real language once it has resolved
// the preference; this only has to happen first.
import './i18n'
import './index.css'
import App from './App.jsx'

// Print the REAL upstream URL of every request. Installed first, before any
// module gets a chance to fire one, so nothing escapes unlogged. Dev only —
// see utils/httpDebug.js.
installHttpDebug();

// Only initialize Sentry in production to avoid noisy development errors.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || (import.meta.env.PROD
  ? "https://3efcbcf7c5a85de1c4ac5b501cd812c9@o274939.ingest.us.sentry.io/4510518368337920"
  : null);

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: true,
    environment: import.meta.env.MODE || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2, // 20% of transactions in production
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
