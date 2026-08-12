// Same-origin base for routes owned by the local Deno BFF. In development the
// /events-api prefix lets Vite proxy these routes without shadowing SPA paths;
// production serves the UI and API from the same origin.
export const DENO_API_BASE = import.meta.env.VITE_EVENTS_API_URL ??
  (import.meta.env.DEV ? '/events-api' : '');
