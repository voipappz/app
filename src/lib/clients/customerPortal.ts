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
  // Login-screen hint: does this tenant use two-step verification? A plain
  // customer.profile field like the rest — the API `.to_s`es it, so it's always
  // a STRING: "true"/"false"/"on"/…, or "" when the key isn't set. (boolean|null
  // stay in the type only to tolerate an older API or a hand-seeded cache.)
  login_otp_enabled?: string | boolean | null;
}

/**
 * The tenant's OTP hint, or `undefined` when the server made no claim.
 *
 * ADVISORY ONLY — use it to set expectations on the login screen, never to
 * decide the flow. The real decision is per-ENVIRONMENT and lives in
 * voipappz-api (`Mediators::User::Login#otp_enabled?` reads
 * `user.environment.profile?(:login_otp_enabled)`), which it can only resolve
 * once it knows the user. This value is per-CUSTOMER and pre-login, so for a
 * customer whose environments differ it will be wrong for some of them. The
 * authority is always the shape of the step-1 login response.
 */
// What the profile store counts as "on". Mirrors Mediators::User::Login#truthy?
// so the hint and the enforcement can never disagree about the same stored value.
const TRUTHY_PROFILE_VALUES = ['true', '1', 'yes', 'on'];

export function isLoginOtpEnabled(): boolean | undefined {
  const val = getCustomerData()?.login_otp_enabled;
  // No claim: key unset, explicit null, or an empty hstore value.
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  return TRUTHY_PROFILE_VALUES.includes(String(val).trim().toLowerCase());
}

/**
 * Should the login screen expect a code? **OTP is the default** — we assume
 * two-step verification unless the tenant explicitly says `false`.
 *
 * Deliberately distinct from `isLoginOtpEnabled()`: that one reports what the
 * server actually said (including "nothing"), this one applies our assumption on
 * top. Keeping them apart means a wrong hint can be traced to the assumption
 * rather than blamed on the payload.
 *
 * Still only a hint — it changes copy, never the flow. The step-1 response
 * decides whether a code is really sent.
 */
export function expectsLoginOtp(): boolean {
  return isLoginOtpEnabled() !== false;
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
