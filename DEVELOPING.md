# Developing on this app

A guide for teams building tenant features on top of this template. The app is
**component-based** and talks to **one backend — the voipappz-api mothership**.
A tenant fork changes **env, not code**: repoint the mothership endpoints
(`VITE_API_TARGET` dev / `ENGINE_URL` prod) and the same components light up
against that tenant's data.

> Architecture context: [ARCHITECTURE.md](./ARCHITECTURE.md) · repo conventions:
> [CLAUDE.md](./CLAUDE.md). This file is the **how-to for adding features**.

---

## 1. The data-access layer

Everything that talks to the backend lives in two folders. Use these — don't
hand-roll `fetch` in components.

### `src/lib/` — the plumbing (auth + transport)

| Module | Exports | Use it for |
|---|---|---|
| `lib/auth.ts` | `getToken`, `getSession`, `saveSession`, `logout`, `sessionUser` | The **one credential**. The login JWT is stored here and read by every client. |
| `lib/clients/mothership.ts` | `userLogin(email, pw)`, `verifyOtp(...)` | The **login surface** — password step + OTP step (see §3). |
| `lib/clients/customerPortal.ts` | `loadCustomerPortalData()`, `getCustomerData()` | **Public** tenant branding (name, logo, colour, language). No auth. |
| `lib/clients/api.ts` | `apiList(pathAndQuery)`, `apiGet(pathAndQuery)` | The **authed data plane**. Adds `Authorization: Bearer <token>`, reads the `X-Total` header, and drops the session on 401. |

`apiList` returns `{ rows, total }` (for paginated list endpoints); `apiGet`
returns the parsed JSON object. Both throw on non-2xx. **Every authed read goes
through one of these** — that's the single place auth, paging, and 401 handling
live.

### `src/services/` — one module per backend feature

Thin wrappers that turn `apiList`/`apiGet` into a feature's API + shape mapping:

| Module | Exports | Endpoint |
|---|---|---|
| `services/callsApi.js` | `getCalls(opts)`, `buildCallsQuery(opts)`, `normalizeApiCall(row)` | `GET /api/calls` (server paging/sort/filter, `X-Total`) |
| `services/reportsApi.js` | `getDashboards()`, `runCategory(cat, {startDate,endDate})` | `GET /api/reports/dashboards[/:category]` |
| `services/featuresApi.js` | `getFeatures()` | `GET /api/features` (per-user flag map — see §4) |

**Rule of thumb:** a *service module* knows the endpoint, the query params, and
how to normalize rows. A *component* never builds a URL or knows a header.

---

## 2. Configuration (env)

A fork is configured entirely by env — no code changes.

| Var | Default | Meaning |
|---|---|---|
| `VITE_API_TARGET` / `ENGINE_URL` | `https://cloud.voipappz.io` | The tenant's voipappz-api, reached same-origin via the Vite proxy (dev) / deno forwarder (prod). |
| `VITE_MOTHERSHIP_URL` | — (relative) | Direct-mode escape hatch for static-only hosting (browser calls the mothership cross-origin). Leave unset. |
| `VITE_AUTH_URL` | `/auth/login` | Where the browser posts credentials (rides the Vite/deno proxy). |
| `VITE_MOCK_LOGIN` | — | `1` = offline login mock (any email → OTP `123456`), for local dev with no backend. |

Leave `VITE_API_BASE_URL` **unset** — setting it makes requests bypass the Vite
proxy and trip CORS (see CLAUDE.md).

---

## 3. Auth & login (with optional OTP)

`lib/clients/mothership.ts` drives the two-step login. `userLogin` returns a
`LoginStep` that is **either** an authed session **or** an OTP challenge:

```js
import { userLogin, verifyOtp } from '../lib/clients/mothership';
import { saveSession } from '../lib/auth';

const step = await userLogin(email, password);   // { status: 'otp' | 'ok', tempToken?, session? }
if (step.status === 'otp') {
  // 2-step: collect the emailed 6-digit code, then:
  const session = await verifyOtp(step.tempToken, code, email, password);
  saveSession(session);
} else {
  saveSession(step.session);   // trusted device / password was enough
}
```

Whether OTP is required is a **per-environment** decision on the server
(`login_otp_enabled` on the environment profile) — the client just handles
whichever shape comes back. Do **not** gate OTP with a feature flag.

---

## 4. Feature flags (gate UI per user)

Flags are per-user, served by `GET /api/features` and read with the
`useFeatures` hook:

```js
import { useFeatures } from '../hooks/useFeatures';

function Toolbar() {
  const { isEnabled } = useFeatures();          // fetched once, cached
  return <>{isEnabled('beta_calls') && <BetaCallsButton />}</>;
}

// single-flag convenience:
import { useFeature } from '../hooks/useFeatures';
const { enabled } = useFeature('beta_calls');
```

- **Declare** a flag by adding it to `AppFeatures::REGISTRY` in voipappz-api
  (`config/initializers/flipper.rb`) — that's the list `/api/features` returns.
- **Toggle** it in **nimbus-admin → Settings → Feature Flags** (global, per user,
  per environment, or a % of users).
- Call `clearFeaturesCache()` (from `hooks/useFeatures`) in your logout handler
  so the next user doesn't inherit stale flags.

The map degrades to "all off" if the service is unreachable — a flag hiccup
never breaks the app.

---

## 5. Recipe: add a feature page

`Calls` is the reference. Copy its three-part shape.

**a. Service module** — `src/services/<feature>Api.js`

```js
import { apiList } from '../lib/clients/api';

export function build<Feature>Query({ page = 1, perPage = 20, search } = {}) {
  const p = new URLSearchParams();
  p.set('page', String(page));
  p.set('per_page', String(perPage));
  // date range → search[created_at]=<startEpoch> - <endEpoch>; filters → search[field]
  return p.toString();
}

export function normalize<Feature>(row) {
  return { id: row.uuid, /* flatten row.meta → UI fields */ raw: row };
}

export async function get<Feature>(opts = {}) {
  const { rows, total } = await apiList(`/api/<feature>?${build<Feature>Query(opts)}`);
  return { rows: rows.map(normalize<Feature>), total };
}
```

**b. Hook** — `src/components/<Feature>/use<Feature>.js`
Holds `rows`, `total`, `page`, `perPage`, `orderBy`, `search`, `loading`, and
refetches from the service when those change. (See `Calls/useCalls.js`.) Don't
share a hook between components.

**c. Component** — `src/components/<Feature>/<Feature>.jsx`
Renders the table/UI from the hook. Wire `<TablePagination>` to `total`, column
sort to the hook's `orderBy`, and the shared `common/Filters.jsx` to `search`.
Keep it under ~300 lines; split sub-parts into the same folder.

**d. Register** the route/nav (see `MainMenu` / the app router).

> **Shortcut:** `make module NAME=Agent [ENDPOINT=/api/agents]` scaffolds all
> of the above (service + test + hook + component) in the blueprint shape and
> prints the two registration lines.

### Conventions
- Folder-per-component (`Component.jsx` + hooks + css together).
- i18n via `react-i18next`; the app is RTL-first (`useDirection`).
- Reuse `common/Filters.jsx` + `filterModel.js` for filtering, `Reports/ReportChart.jsx` for charts.

---

## 5b. Optional: the PostgREST data plane

For tenant-custom tables/views beside the mothership. Enable by setting
`POSTGREST_URL` on deno (unset ⇒ `/rest/v1` answers 503). Building blocks:

- `lib/clients/postgrest.ts` — `pgrstList('/my_view?select=*&limit=20')` /
  `pgrstGet` (relative `/rest/v1`, bearer auth, exact counts).
- `<PostgrestTable table="my_view" />` (`components/PostgrestTable/`) — generic
  table with server-side paging + sorting, for quick internal pages.

For a real feature page, wrap PostgREST access in a service module + hook
exactly like §5 — components should not care which plane the data came from.

---

## 6. Testing

- **Unit (Vitest):** service modules and hooks — e.g. `services/callsApi.test.js`
  covers `buildCallsQuery` + `normalizeApiCall`. Mock at the `apiList`/`apiGet`
  boundary; never hit the network.
- **E2E (Playwright):** `tests/` — Input → Submit → capture response → assert.
- **Build gate:** `npm run build` must be clean before shipping.

---

## Quick reference

```
src/
  lib/
    auth.ts                 # the token/session (getToken, login, logout, sessionUser)
    clients/
      api.ts                # apiList / apiGet  ← authed reads
      mothership.ts         # userLogin / verifyOtp
      customerPortal.ts     # loadCustomerPortalData (public branding)
  services/
    callsApi.js             # getCalls / buildCallsQuery / normalizeApiCall
    reportsApi.js           # getDashboards / runCategory
    featuresApi.js          # getFeatures  ← per-user flag map
  hooks/
    useFeatures.js          # useFeatures / useFeature / clearFeaturesCache
  components/
    Calls/                  # ← blueprint feature (service → hook → component)
    Reports/  Login/  Phone/  Dashboard/  common/
```
