# RLS / RBAC test plan — real per-role Supabase users

## Context

The previous RLS suite (`tests/unit/rls-policies-sme.spec.ts`) used a hand-crafted JWT (`SME_MOCK_JWT`) as the `Authorization` header. Supabase rejects that token at signature verification (`PGRST301 JWSError JWSInvalidSignature`), so it never reaches any RLS policy — the test could only catch unauthenticated cases.

To actually exercise RLS per role, we need real Supabase-issued tokens. Plan: one dedicated Supabase auth account per app role, signed in at test time via `supabase.auth.signInWithPassword`.

## Status

Wired up so far:

- `tests/helpers/test-users.ts` — `signInAs(role)` returns a real client + `accessToken`. `hasTestUser(role)` for skip-gating. `clientFromToken(token)` to build a PostgREST client from an existing token.
- `.env.example` — stubs for `TEST_USER_<ROLE>_EMAIL` / `TEST_USER_<ROLE>_PASSWORD` for every role in `ROLE_TEMPLATES` (`src/config/permissions.js`).

Not yet done (handed back to user):

1. Create the actual Supabase users (auth + `public.users` row + sync the role into `auth.users.raw_user_meta_data` until the broken `sync_user_role_to_metadata` trigger is fixed — see `migrations/008_populate_supabase_user_metadata.sql` and the silent `EXCEPTION WHEN OTHERS` block).
2. Populate the matching values in the gitignored `.env`.
3. Rewrite the auth-required cases in `tests/unit/rls-policies-sme.spec.ts` (and any future per-role spec) to use `signInAs(...)` instead of `SME_MOCK_JWT`.

## How to create each test user

For every role you want to cover:

1. Supabase Dashboard → Authentication → Users → Add user (email + password, Auto-Confirm). Copy the new user's UUID.
2. In SQL editor (one statement per user):
   ```sql
   INSERT INTO public.users (auth_user_id, role, name, phone)
   VALUES ('<UUID>', '<role>', 'Test <role>', '');

   -- Trigger is silently failing today, so do the metadata sync by hand:
   UPDATE auth.users
   SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                          || jsonb_build_object('role', '<role>', 'name', 'Test <role>')
   WHERE id = '<UUID>';
   ```
3. Put the credentials in `.env`:
   ```
   TEST_USER_<ROLE>_EMAIL=test-<role>@voipappz.local
   TEST_USER_<ROLE>_PASSWORD=<chosen-password>
   ```

`<role>` upper-cased becomes the env-var key. Example: `sales_agent_smb` → `TEST_USER_SALES_AGENT_SMB_EMAIL`.

## Wiring it into the existing RLS suite

Once at least one role is set up, swap usages in `tests/unit/rls-policies-sme.spec.ts`:

```ts
import { signInAs, hasTestUser } from '../helpers/test-users';

let smeToken: string;

test.describe('RLS Policies - sales_agent_sme', () => {
  test.beforeAll(async () => {
    if (!hasTestUser('sales_agent_sme')) test.skip(); // skip the whole block
    const session = await signInAs('sales_agent_sme');
    smeToken = session.accessToken;
  });

  // ...each test that used `SME_MOCK_JWT` now uses `smeToken`:
  test('blocks authenticated access to installations', async () => {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${smeToken}` } }
    });
    // ...
  });
});
```

The current diagnostic `console.log('[rls installations sme]', { code, message, details })` should be kept — when the JWT is valid, the failure mode becomes an actual RLS check, and we'll want to see the error from any real policy denial.

## Notes / gotchas

- `signInWithPassword` returns a session with `access_token` (1-hour lifetime). Each `test.beforeAll` runs once per worker, which is fine; if a suite grows past ~50 min we'd want to refresh.
- Don't commit real `.env` values. Only `.env.example` is committed.
- The current user `rotem@voipappz.com` was switched between roles during this session; do not reuse it as a fixed test user. Create dedicated `test-<role>@voipappz.local` accounts so a real-user role change doesn't break CI.
- The broken metadata-sync trigger (`migrations/008_populate_supabase_user_metadata.sql`) means step 2 of "How to create each test user" must include the manual `UPDATE auth.users` until that trigger is fixed. A follow-up to drop the silent `EXCEPTION WHEN OTHERS` block + `ALTER FUNCTION ... OWNER TO postgres` is tracked separately.

## Files touched in this iteration

- `tests/helpers/test-users.ts` — new helper.
- `tests/helpers/README.md` — this document.
- `.env.example` — stubs for the per-role env vars.
