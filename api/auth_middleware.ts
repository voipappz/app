// JWT verification middleware for Deno API endpoints.
//
// Supabase Auth was removed — the app authenticates against the mothership
// (voipappz-api). JWT-gated Deno routes are therefore disabled by default; wire
// a mothership-token verifier here if a Deno route ever needs to gate on the
// user. Keeping the interface so callers don't change.

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export type JwtVerifier = (request: Request) => Promise<AuthResult>;

/**
 * Default verifier: no auth configured (rejects). No external dependency, so the
 * Deno backend runs natively with zero install. Replace with a mothership-token
 * check if a gated route is added.
 */
export function createJwtVerifier(): JwtVerifier {
  return (): Promise<AuthResult> =>
    Promise.resolve({ authenticated: false, error: "Auth not configured" });
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
