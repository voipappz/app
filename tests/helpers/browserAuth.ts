import { BrowserContext } from '@playwright/test';

/**
 * Real accounts-table browser login (no Supabase).
 *
 * POSTs credentials to the app's own `/auth/login` (deno → PostgREST
 * `/rpc/login`, the accounts table), then seeds the returned session into
 * localStorage under `auth` — exactly where `src/lib/auth.ts` reads it on boot.
 * So the app boots with a real, signature-valid account JWT and PostgREST reads
 * (RLS-ready) actually evaluate. No fabricated JWTs, no route stubbing.
 *
 * Credentials come from `ACCOUNT_EMAIL` / `ACCOUNT_PASSWORD` (see .env / .env.example).
 */
export async function loginWithAccount(
  context: BrowserContext,
  baseURL: string = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4200',
): Promise<void> {
  const email = process.env.ACCOUNT_EMAIL;
  const password = process.env.ACCOUNT_PASSWORD;
  if (!email || !password) {
    throw new Error('Set ACCOUNT_EMAIL / ACCOUNT_PASSWORD (accounts-table login) in .env');
  }

  const res = await fetch(`${baseURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`account login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const claims = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64url').toString());
  const session = {
    access: data.token,
    email: data.email ?? claims.email ?? email,
    account_uuid: data.account_uuid ?? claims.account_uuid,
    customer_uuid: data.customer_uuid ?? claims.customer_uuid,
    environment_uuids: data.environment_uuids ?? claims.environment_uuids,
    expires_at: claims.exp,
  };

  await context.addInitScript(
    ({ session }) => {
      localStorage.setItem('app-language', 'en');
      localStorage.setItem('auth', JSON.stringify(session));
    },
    { session },
  );
}

