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
  // Two-step verification hint for the login screen. A plain customer.profile
  // field like the rest, so it arrives as an hstore string: "true", "false", or
  // "" when unset. See expectsLoginOtp().
  login_otp_enabled?: string;
}

/**
 * Should the login screen say "expect a code"? A HINT ONLY — it changes copy,
 * never the flow, and it's client-side so it's editable. The step-1 login
 * response stays the authority. But it reads the SAME per-customer key the
 * server enforces on, so a correct payload and a correct decision agree.
 *
 * The tenant owns the value AND its default: the API always sends a non-empty
 * string, so we just decode it — with Login#truthy?'s rule, so the hint can't
 * disagree with the enforcement. Only a missing payload falls back here.
 */
export function expectsLoginOtp(): boolean {
  const val = getCustomerData()?.login_otp_enabled;
  if (!val) return true;   // no portal data or older API — match the API default
  return ['true', '1', 'yes', 'on', 'enabled'].includes(String(val).trim().toLowerCase());
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
    // Branding is cosmetic and boot AWAITS this, so an unreachable mothership
    // must fail fast rather than hang: a TCP connect that never answers is not
    // caught by the try/catch below, it just never settles, and the app renders
    // nothing until the OS gives up minutes later. Budget it.
    const timeout = AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined;
    const res = await fetch(`${BASE}${PORTAL_PATH}`, timeout ? { signal: timeout } : {});
    if (!res.ok) return null;
    const data = (await res.json()) as CustomerPortalData;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    return data;
  } catch {
    return null;
  }
}
