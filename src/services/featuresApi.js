// Features API module — the per-user feature-flag map from voipappz-api.
//   GET /api/features → { "<flag>": true|false, ... }
// Evaluated server-side for the logged-in user (user + environment actors) over
// the declared registry (AppFeatures in voipappz-api). Use it to gate UI per
// user. Managed from nimbus-admin → Settings → Feature Flags.
//
// NB: user-login OTP is NOT a feature flag — it's a per-customer setting on
// the customer profile. Don't gate OTP through here.
import { apiGet } from '../lib/clients/api';

/**
 * Fetch the current user's feature map. Degrades to `{}` (everything off) on any
 * error other than a 401 — a flag service hiccup must never break the app. A 401
 * is handled by apiGet (drops the session), so it isn't swallowed here.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getFeatures() {
  try {
    const data = await apiGet('/api/features');
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    if (String(err?.message || '').includes('→ 401')) throw err;
    return {};
  }
}
