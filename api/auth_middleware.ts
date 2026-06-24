// JWT verification middleware for Deno API endpoints
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.ts';

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export type JwtVerifier = (request: Request) => Promise<AuthResult>;

/**
 * Create a JWT verifier that validates tokens against Supabase Auth.
 */
export function createJwtVerifier(): JwtVerifier {
  // Built only when Supabase is configured. Without it, JWT-gated routes
  // (e.g. /calls/:id/transcribe) reject — the DuckDB calls/events path needs no auth client.
  const authClient = SUPABASE_URL
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    : null;

  return async (request: Request): Promise<AuthResult> => {
    if (!authClient) return { authenticated: false, error: "Auth not configured" };

    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { authenticated: false, error: "Missing or invalid Authorization header" };
    }

    const token = authHeader.slice(7);

    try {
      const { data: { user }, error } = await authClient.auth.getUser(token);

      if (error || !user) {
        return { authenticated: false, error: error?.message || "Invalid token" };
      }

      return {
        authenticated: true,
        userId: user.id,
        email: user.email
      };
    } catch (_err) {
      return { authenticated: false, error: "Token verification failed" };
    }
  };
}

/**
 * Create a 401 JSON response for unauthenticated requests.
 */
export function unauthorizedResponse(error: string, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error }),
    { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}
