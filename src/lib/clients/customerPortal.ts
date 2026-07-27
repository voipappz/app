// Customer portal data — the per-tenant branding/settings the portal skins with.
//
// Mirrors voipappz-app (handleRequest.service.ts): GET /tasks/customer_portal_data,
// cached in localStorage under `customerData`. The API serves it from
// `customer.profile` (voipappz-api lib/serializers/customer.rb), so a tenant
// rebrands with NO code change.
//
// PUBLIC — sent with NO auth headers. That's deliberate: the branding (logo,
// title, colour, language) skins the LOGIN page, before any session exists.
// Verified live against MTN (200 unauthenticated, CORS open):
//   { name, language, logo_url, logo_icon, logo_title, logo_color }
// `||` not `??` so an empty-string env still falls back to the default.
// Relative by default — rides the Vite proxy (dev) / deno forwarder (prod).
const BASE = (((import.meta.env.VITE_MOTHERSHIP_URL as string) || '')).replace(/\/$/, '');
const PORTAL_PATH = ((import.meta.env.VITE_PORTAL_DATA_PATH as string) || '/tasks/customer_portal_data');
const STORAGE_KEY = 'customerData';

export interface CustomerPortalData {
  name?: string;
  language?: string;    // e.g. 'en' — drives i18n/direction
  logo_url?: string;    // logo on dark bg
  logo_icon?: string;   // favicon
  logo_title?: string;  // app/tenant title
  logo_color?: string;  // brand colour
}

/** The cached portal data (written at login), or null. */
export function getCustomerData(): CustomerPortalData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomerPortalData) : null;
  } catch {
    return null;
  }
}

export function clearCustomerData(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage disabled */ }
}

/**
 * Fetch + cache the portal data. Called at BOOT (before any session) so the login
 * page is already branded. Sends NO auth headers — the endpoint is public.
 * Never throws: branding is cosmetic, so a failure must not block the app —
 * callers fall back to the env-driven defaults in src/config.js.
 */
export async function loadCustomerPortalData(): Promise<CustomerPortalData | null> {
  try {
    const res = await fetch(`${BASE}${PORTAL_PATH}`);
    if (!res.ok) return null;
    const data = (await res.json()) as CustomerPortalData;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    return data;
  } catch {
    return null;
  }
}
