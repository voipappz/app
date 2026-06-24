# Supabase Auth Migration

## Overview

The app migrated from custom password auth (via a Node.js `/auth` API) to **Supabase Auth** with **Row Level Security (RLS)**. Users authenticate with `signInWithPassword()` directly against Supabase — no custom auth server.

## Architecture

```
Browser                          Supabase                    Deno API
  │                                 │                           │
  ├── signInWithPassword(email,pw) ──>│                           │
  │<── JWT + session ───────────────│                           │
  │                                 │                           │
  ├── SELECT * FROM orders ─────────>│ RLS checks JWT ──> rows  │
  │<── filtered rows ───────────────│                           │
  │                                 │                           │
  ├── POST /send_pdf ───────────────┼──── Bearer JWT ──────────>│
  │                                 │     verifyJwt() ──────────>│ auth.getUser(token)
  │                                 │<── valid user ────────────│
  │<── PDF result ──────────────────┼───────────────────────────│
```

## Two Security Layers

### Layer 1: RLS (Frontend → Supabase)

All frontend queries go through the Supabase JS client (`src/lib/supabase.ts`), which uses the **anon key** + the user's **JWT** (stored automatically by Supabase after login).

- **Anon key alone** → gets **nothing** (no RLS policies for `anon` role)
- **Anon key + valid JWT** → gets rows matching `authenticated` policies

Policies are intentionally permissive (Phase 1): any authenticated user can read/write all rows. Per-role restrictions come in Phase 2.

### Layer 2: JWT Middleware (Frontend → Deno API)

The Deno API uses the **service role key** (bypasses RLS) because it needs full data access for PDF generation, webhooks, etc. Protection is at the HTTP layer:

| Endpoint | Auth | Details |
|---|---|---|
| `POST /new` | JWT required | `auth_middleware.ts` validates via `supabase.auth.getUser(token)` |
| `POST /send_pdf` | JWT required | Same |
| `POST /send_company_pdf` | JWT required | Same |
| `POST /sign_pdf` | JWT required | Same |
| `POST /sign_company_pdf` | JWT required | Same |
| `POST /webhook/docuseal` | Webhook secret | Own auth via `DOCUSEAL_WEBHOOK_SECRET` header |
| `GET /test` | None | Health check, no sensitive data |

## Login Flow

1. User enters email + password on `/login`
2. `Login.js` calls `supabase.auth.signInWithPassword({ email, password })`
3. Supabase Auth validates credentials, returns JWT session
4. `Login.js` calls `getUser(email)` from `src/lib/db.ts` to fetch user profile (name, role, ACL)
5. Profile is cached in `localStorage` key `user_profile`
6. `AuthContext` sets `isAuthenticated = true`, renders the app

## Auth Gate Pattern

`AuthContext.jsx` blocks rendering until auth state is determined:

```jsx
if (!isInitialized) return null;  // Don't render anything yet
return <AuthContext.Provider>{children}</AuthContext.Provider>;
```

On mount, it checks `supabase.auth.getSession()`:
- Session exists → load cached `user_profile` from localStorage → authenticated
- No session → not authenticated → `ProtectedRoute` redirects to `/login`

## localStorage Keys

| Key | Contents | Set by |
|---|---|---|
| `sb-your-project-ref-auth-token` | Supabase session (JWT, refresh token) | Supabase JS client |
| `user_profile` | App user profile (id, name, email, role, acl) | `Login.js` / `AuthContext.jsx` |
| `app-language` | UI language (`en` / `he`) | Language selector |

## 401 Handling

When the API returns 401, a custom event triggers logout:

```javascript
window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { reason } }));
```

`AuthContext` listens for this, calls `supabase.auth.signOut()`, clears `user_profile`, redirects to `/login`.

## Frontend API Helper

`src/lib/api.ts` provides `fetchWithAuth()` for calling Deno API endpoints:

```typescript
import { fetchWithAuth } from '../../lib/api';
const res = await fetchWithAuth('/deno-api/send_pdf', {
  method: 'POST',
  body: JSON.stringify({ order_id: '...' })
});
```

It automatically gets the JWT from `supabase.auth.getSession()` and adds it as `Authorization: Bearer <token>`.

## SQL Migrations (run in Supabase SQL Editor)

Run in order. 001-003 are safe (no behavior change). 004 is the big switch.

| File | What it does |
|---|---|
| `migrations/001_add_auth_user_id.sql` | Adds `auth_user_id` column to `users`, links by email match |
| `migrations/002_rls_helper_functions.sql` | Creates `get_current_user_id()` and `get_current_user_role()` |
| `migrations/003_rls_policies.sql` | Creates RLS policies (authenticated = full access, anon = nothing) |
| `migrations/004_enable_rls.sql` | **ENABLES RLS** on all 8 tables |
| `migrations/005_rollback_rls.sql` | Emergency rollback — disables RLS |

### Validation after 001:
```sql
SELECT id, email, auth_user_id FROM public.users WHERE auth_user_id IS NULL;
-- Must return 0 rows
```

### Validation after 003:
```sql
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
-- Should show 20+ policies
```

### Rollback (instant, non-destructive):
```sql
-- Run 005_rollback_rls.sql
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
-- ... all tables
```

## RLS Policies (Phase 1)

Intentionally permissive — any authenticated user gets full access:

| Table | SELECT | INSERT | UPDATE |
|---|---|---|---|
| `users` | All authenticated | - | Own row only (`auth_user_id = auth.uid()`) |
| `acl` | All authenticated | - | - |
| `companies` | All authenticated | All authenticated | All authenticated |
| `company_branches` | All authenticated | All authenticated | All authenticated |
| `products` | All authenticated | - | - |
| `orders` | All authenticated | All authenticated | All authenticated |
| `order_items` | All authenticated | All authenticated | All authenticated |
| `installations` | All authenticated | All authenticated | All authenticated |

**No policies for `anon` role** — anon key with no JWT gets zero rows.

## CI Pipeline (CircleCI)

The `test-api` job runs Deno API tests including:
- `POST /new` without JWT → 401
- `POST /webhook/docuseal` without JWT → NOT 401 (webhook exempt)
- `GET /test` → 200 (health check exempt)
- PDF service tests with mock JWT verifier

## Key Files

| File | Purpose |
|---|---|
| `src/components/Login/Login.js` | `signInWithPassword()` login |
| `src/context/AuthContext.jsx` | Auth gate, session management, 401 handling |
| `src/lib/supabase.ts` | Supabase client (anon key, `persistSession: true`) |
| `src/lib/api.ts` | `fetchWithAuth()` helper for Deno API calls |
| `src/lib/db.ts` | All Supabase queries (auto-include JWT) |
| `api/auth_middleware.ts` | JWT verifier (`supabase.auth.getUser(token)`) |
| `api/server.ts` | JWT check on all POST endpoints |
| `tests/security.spec.ts` | Proves redirect + RLS data segmentation |
| `tests/auth-fixture.ts` | Mock Supabase session for Playwright tests |
| `migrations/001-005` | RLS setup SQL |

## What Was Removed

- `src/services/authService.js` — custom auth with `/auth/login`, `/auth/refresh` endpoints
- `/auth` proxy in `vite.config.js` — no longer needed
- Connection test in `supabase.ts` — would fail after RLS with anon key
- `testConnection()` in `db.ts` — dead code
