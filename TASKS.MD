# Project Tasks

## Completed Tasks

### Customer Page Migration (Completed: 2025-10-29)
✅ **Migrated customer page from main branch (Next.js) to va-dev (React/Vite)**
  - ✅ Converted all 7 customer form components from shadcn/ui to Material-UI
  - ✅ BusinessInfoForm.tsx - Converted to MUI (Paper, TextField, Select, Button)
  - ✅ SignatoryForm.tsx - Converted to MUI
  - ✅ ContactPersonForm.tsx - Converted to MUI (includes Switch component)
  - ✅ BranchForm.tsx - Converted to MUI (complex form with add/remove functionality)
  - ✅ TechnicalInfoForm.tsx - Converted to MUI
  - ✅ AdditionalInfoForm.tsx - Converted to MUI (file upload placeholders)
  - ✅ new-customer.tsx - Converted main component with MUI Stepper
    - Fixed CSS duplicate classes (w-6/w-10 issue)
    - Implemented responsive design (mobile LinearProgress, desktop Stepper)
    - Preserved all logic and test IDs for Cypress
  - ✅ Build verification passed (npm run build)
  - ✅ Cypress installed and ready for testing
  - ✅ Updated CLAUDE.md with customer component documentation

### Architecture Improvements
✅ **Unified UI Library - Material-UI Only**
  - Removed shadcn/ui dependency from customer components
  - All components now consistently use Material-UI
  - Better bundle size and consistent UX
  - Reduced from mixed UI libraries to Material-UI exclusively

## Current State
- ✅ Customer creation form fully functional at `/new-customer`
- ✅ 6-step wizard with validation
- ✅ Branch management for multi-location businesses
- ✅ Mobile and desktop responsive
- ✅ RTL support for Hebrew language
- ✅ Integrated with existing entity system (Customer, Branch)
- ✅ All IDs preserved for Cypress testing

## Completed Tasks

### Global RTL/LTR Direction Support (Completed: 2025-11-18) ✅
**Status:** 100% Complete - Full RTL/LTR support with dynamic switching

**Implementation:**
- ✅ Installed and configured `stylis-plugin-rtl` for Material-UI RTL support
- ✅ Created `/app/src/context/DirectionContext.jsx` with React Context for state management
  - Dynamically creates emotion cache based on direction (RTL/LTR)
  - Dynamically creates MUI theme based on direction
  - Provides `toggleDirection()` function for instant switching without page reload
  - Syncs direction with `document.documentElement.dir` and localStorage
- ✅ Updated App.jsx to use DirectionProvider (wraps entire app)
- ✅ Updated main.jsx to set initial document direction from localStorage
- ✅ Updated appTheme.js (removed direction dependencies, now managed by context)
- ✅ Migrated ALL 10 CSS files to use CSS logical properties:
  - ✅ MainMenu.css
  - ✅ Layout.css
  - ✅ Notifications.css
  - ✅ NotificationPanel.css
  - ✅ WebRTCPhone.css
  - ✅ Live.css
  - ✅ RulesManagement.css
  - ✅ RuleForm.css
  - ✅ DataTable.css
  - ✅ FilterBar.css
- ✅ Added direction toggle button in MainMenu (desktop sidebar + mobile drawer)
- ✅ Updated all tooltip placements to be direction-aware
- ✅ **Fixed:** Direction toggle now works WITHOUT page reload (smooth transition)
- ✅ Build verification passed

**Key Features:**
- **Zero reload direction switching** - Instant RTL ↔ LTR toggle
- **Persistent preference** - Direction saved to localStorage
- **Global CSS logical properties** - All layouts auto-flip based on direction
- **MUI RTL plugin** - All Material-UI components auto-flip
- **Mobile & Desktop support** - Responsive behavior in both directions

**Files Created:**
- `/app/src/context/DirectionContext.jsx` - Direction state management with React Context

**Files Modified:**
- `/app/src/App.jsx` - Wrapped with DirectionProvider
- `/app/src/components/MainMenu/MainMenu.jsx` - Uses `useDirection()` hook
- `/app/src/theme/appTheme.js` - Removed direction dependencies
- 10 CSS files migrated to logical properties

### Header Layout & Styling Fixes (Completed: 2025-11-18) ✅
**Status:** Complete - Fixed header positioning and unified color theme

**Issues Resolved:**
1. **Header covering sidebar** - Header was using physical property `right: 0` which didn't flip with RTL/LTR
2. **Color mismatch** - Header was blue (#1976d2) while sidebar was black (#000)

**Implementation:**
- ✅ Fixed Layout.jsx header positioning:
  - Changed `right: 0` → `insetInlineEnd: 0` (RTL-aware logical property)
  - Header now positions correctly in both RTL and LTR modes
  - No overlap with sidebar in either direction
- ✅ Updated appTheme.js header color:
  - Changed backgroundColor from `#1976d2` (blue) → `#000000` (black)
  - Unified dark theme across header and sidebar
- ✅ Build verification passed

**Files Modified:**
- `/app/src/components/Layout/Layout.jsx` - Header positioning with logical properties
- `/app/src/theme/appTheme.js` - Header color to match sidebar

**Result:**
- Header and sidebar no longer overlap in RTL or LTR modes
- Consistent black theme across navigation elements
- Proper RTL/LTR behavior with logical properties

### Mocked Call Transcription for Demo (Added: 2026-06-11, branch `free-tel`) ⚠️ DEMO-ONLY

**Status:** Active in `free-tel` — the Calls list is **real** (from
`cloud.voipappz.io/rest/v1/calls`), but the **Transcribe button is faked**. It
does NOT call the Gemini transcription backend; it replays a local
`queued → processing → completed` progression and reveals a canned Hebrew
conversation chosen by call direction. Built so a client can't tell it's mocked.

**Why:** demo without needing `GEMINI_API_KEY`, real recordings, or the
transcription worker.

**Files involved:**
- `src/components/Calls/conversation-mocks.ts` — canned Hebrew conversations
  (billing/Partner, internet/Bezeq) + adapters `conversationToTranscript()` and
  `mockTranscriptForCall(call)`.
- `src/components/Calls/Calls.jsx` — `EventTimeline.triggerTranscribe()` was
  replaced with the local simulation; also flips the list chip via the
  `onTxStatus` prop wired from the parent.
- `src/components/Calls/useCalls.js` — added `patchCall(id, patch)` (generic;
  used to optimistically flip `transcription_status` on the list row).

#### ☐ TO SWITCH TO REAL TRANSCRIPTION DATA — checklist
☐ **`src/components/Calls/Calls.jsx` → `triggerTranscribe()`**: restore the real
   flow — `await httpClient.post('/calls/:id/transcribe', {}, { baseUrl: EVENTS_API })`
   then poll `GET ${EVENTS_API}/calls/:id/transcript` until status is
   `completed`/`failed` (see git history of this file for the original body).
☐ **`Calls.jsx`**: re-add `import { httpClient } from '../../lib/httpClient';`
   (removed when the mock replaced the POST) and remove
   `import { mockTranscriptForCall } from './conversation-mocks';`.
☐ **`Calls.jsx`**: the `onTxStatus` chip-flip can STAY (harmless) but with the
   real flow it should be driven by the polled server status, not the simulated
   stages. Either feed real statuses into `onTxStatus`, or drop the
   `onTxStatus`/`patchCall` wiring and let `refresh()` re-read the chip.
☐ **Backend must be live**: `GEMINI_API_KEY` set on `deno-api`, recordings
   reachable (S3), and the transcription worker running — otherwise the real
   POST returns 503 (`calls.tx.disabled`).
☐ **`src/components/Calls/conversation-mocks.ts`**: delete (or keep only if a
   test references it). Nothing else imports it once `Calls.jsx` is reverted.
☐ **`useCalls.js` `patchCall`**: keep — it's a generic optimistic-update helper,
   not mock-specific.
☐ Verify: open a real call → Transcribe → confirm a request hits
   `/calls/:id/transcribe` (network tab) and the transcript matches the server.

## Planned Tasks

### Public Registration Page → Supabase (Planned: 2026-07-22) ☐ NOT STARTED

**Goal:** A **public `/register` page** in this app where visitors from the company's
marketing site sign up; **every submission saved to a Supabase project** (new project — user
provides `SUPABASE_URL` + service‑role key). Lead‑capture pipeline, **separate from app login**
(login stays on the mothership `/auth/login`; Supabase is only the leads store).

**v1 scope:** registration only (name, email, phone). No service selection / payment yet — data
model is built to extend to those later without a breaking change.

**Architecture (decided):** frontend form → `POST /public/register` (same‑origin; Vite proxies
to deno in dev, deno serves it in prod) → deno validates + inserts into Supabase `registrations`
via the **service‑role key, server‑side only** (never in the browser; client already built in
`api/supabase.ts` and passed to `createRequestHandler`).

**Chosen defaults (all reversible):** duplicate email → idempotent `200` (anti‑enumeration);
`/register` reuses Login's split‑screen sidebar; `migrations/` versioned but applied by hand in
the Supabase SQL editor (no runner exists).

#### Implementation checklist
☐ **`migrations/0001_registrations.sql`** (new) — table `public.registrations`:
   `id uuid pk default gen_random_uuid()`, `name/email/phone text not null`, extensible
   `status text default 'new'`, `source`, `notes`, `metadata jsonb default '{}'`,
   `created_at`, `updated_at`. **Unique index on `lower(email)`** (dedupe, raises PG `23505`),
   index on `created_at desc`, **RLS enabled + NO policies** (service‑role bypasses; anon
   deny‑all), `updated_at` auto‑touch trigger. Apply it in the Supabase SQL editor.
☐ **`api/register.ts`** (new) — pure `validateRegistration(input)`: trim, lowercase+regex email,
   require name/email/phone, phone ≥ 7 digits, length caps → whitelisted `{name,email,phone,source}`.
   Supabase‑free so it unit‑tests offline (mirror `api/health_freshness.ts`).
☐ **`api/server.ts`** — add `POST /public/register` right after the `/auth/login` block:
   `!supabase → 503`; per‑IP in‑memory rate limit (5/60s → 429); **honeypot** `website` non‑empty
   → `201` write nothing; `validateRegistration` → 400; insert → map `23505` to
   `200 {ok:true,duplicate:true}`, other errors 502, success 201. Never return row internals.
☐ **`api/server.ts` / `api/config.ts`** — health‑check fix: `checkHealth` probes `.from("users")`
   which won't exist in the new project (would 503 `/health`). Add `SUPABASE_HEALTH_TABLE`
   (default `"registrations"`) to config and use it instead of hard‑coded `"users"`.
☐ **`src/lib/register.ts`** (new) — `registerUser(payload)` plain `fetch` to
   `VITE_REGISTER_URL ?? '/public/register'`. **No bearer token, no localStorage, do NOT use
   `httpClient`** (it injects Authorization). Model `lib/auth.ts` fetch/error shape.
☐ **`src/components/Register/`** (new) — `Register.js` (`useRegister`: local `useState` fields +
   `touched` map + local `loading/error/submitted` + hidden `website` honeypot; NO AuthContext,
   NO auto‑login), `Register.jsx` (copy `Login.jsx`: Container/Paper, brand logo, `Alert` error,
   name/email/phone TextFields w/ required helpers, submit Button + CircularProgress, hidden
   honeypot input, success panel `data-testid="register-success"` linking to `/login`),
   `Register.css` (copy `Login.css`). Testids: `register-form,name-input,email-input,phone-input,register-button`.
☐ **`src/App.jsx`** — add `<Route path="/register" element={<PublicRoute><Layout><Register/></Layout></PublicRoute>} />`.
☐ **`src/components/Layout/Layout.jsx`** — generalize `isLoginPage` →
   `isAuthPage = pathname==='/login' || pathname==='/register'` so `/register` reuses the split‑screen.
☐ **`src/i18n/locales/{en,he}.json`** — add a `register` block next to `login`
   (title/name/email/phone/requiredField/invalidEmail/invalidPhone/submit/submitting/
   successTitle/successBody/backToLogin/haveAccount/genericError). Hebrew mirror; RTL automatic.
☐ **`docker-compose.yml` `deno-api`** — set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   (+ `SUPABASE_HEALTH_TABLE=registrations`) from the NEW project. Service‑role key **never**
   `VITE_`‑prefixed. Update `.env.example` (do not overwrite `.env` without confirmation).
☐ **`vite.config.js`** — add dev proxy `'/public/register': { target: DENO, changeOrigin: true }`
   (no rewrite, mirrors `/auth/login`). No prod proxy needed.
☐ **Tests** — `api/tests/register.test.ts` (validateRegistration cases: valid trims+lowercases+
   defaults source; missing fields; bad email; short phone; over‑length) and
   `tests/register.spec.ts` (route‑mock `**/public/register` → 201, fill by testid, submit,
   assert `register-success` + URL stays `/register`; second case: missing field shows helper,
   no request fired).
☐ **`api/CLAUDE.md`** — add the endpoint + key files per its end‑of‑task rule.

#### Extensibility (later: services + purchase)
`metadata jsonb` + `status`/`source` already present → adding service selection = write
`metadata.service` (or a later migration adds a typed `service_id` + `services` table). A payment
step can return the new row `id` for checkout; `status` (`new → contacted → converted`) drives
the sales funnel. Registrations stay decoupled from mothership accounts unless later promoted.

#### Verification
Run `0001_registrations.sql` in Supabase → curl `POST :4001/public/register` (happy `201`+row;
missing/bad → `400`; honeypot → `201` no row; duplicate → `200`; 6th rapid call → `429`) →
`:4001/health` supabase `up` → `make dev`, open `/register`, submit → success panel, NO `auth`
in localStorage, Hebrew/RTL renders, row in Supabase → deno unit + Playwright tests pass.

---

## Next Steps
☐ מילוי אוטומטי של כתובת העסק לסניף בודד (Auto-fill business address for single branch)
☐ הוספת שדה מספר לקוח עבור HOT (Add customer number field for HOT)
☐ Run full Cypress test suite for customer-creation.cy.ts
☐ Set up CircleCI for automated testing
☐ Test customer creation flow end-to-end in development environment
☐ Consider removing unused shadcn/ui components from src/components/ui/ if no longer needed

---

<!--
### Previous/Old Tasks (Commented Out - Not Part of Current Migration)
WebRTC Phone Integration tasks moved to separate backlog
-->
