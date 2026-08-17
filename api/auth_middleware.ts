// Token verification for Deno-owned endpoints. The mothership owns user
// sessions, so Deno validates a bearer token against its lightweight features
// endpoint and keeps only a short, bounded in-memory result cache.

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

export type JwtVerifier = (request: Request) => Promise<AuthResult>;

interface VerifierOptions {
  engineUrl?: string;
  validationPath?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  maxCacheEntries?: number;
  maxPending?: number;
}

// The caller’s own login token. Exported because the cable bridge needs it:
// the node accepts a mothership user token as its `?token=`, so the login the
// browser already did IS the cable credential — nothing is minted server-side.
export function requestToken(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  // Browsers cannot add Authorization to a WebSocket handshake. Carry an
  // encoded token as a private subprotocol instead of putting it in the URL,
  // where reverse proxies and access logs routinely record it.
  const url = new URL(request.url);
  if (url.pathname !== '/ws/events') return '';
  const offered = (request.headers.get('sec-websocket-protocol') || '')
    .split(',').map((value) => value.trim());
  const encoded = offered.find((value) => value.startsWith('voipappz-bearer.'))
    ?.slice('voipappz-bearer.'.length);
  if (!encoded) return '';
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(encoded.length + ((4 - encoded.length % 4) % 4), '=');
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function createJwtVerifier(options: VerifierOptions = {}): JwtVerifier {
  const engineUrl = (options.engineUrl ?? Deno.env.get('ENGINE_URL') ??
    Deno.env.get('MOTHERSHIP_URL') ?? '').replace(/\/$/, '');
  const validationPath = options.validationPath ?? Deno.env.get('AUTH_VALIDATION_PATH') ?? '/api/features';
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 500);
  const maxPending = Math.max(1, options.maxPending ?? 32);
  const cache = new Map<string, { authenticated: boolean; expiresAt: number }>();
  const pending = new Map<string, Promise<AuthResult>>();

  function cacheResult(token: string, authenticated: boolean) {
    cache.delete(token);
    cache.set(token, { authenticated, expiresAt: now() + (authenticated ? 30_000 : 5_000) });
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value as string);
  }

  return async (request: Request): Promise<AuthResult> => {
    if (!engineUrl) return { authenticated: false, error: 'Auth not configured' };
    const token = requestToken(request);
    if (!token) return { authenticated: false, error: 'Missing bearer token' };

    const cached = cache.get(token);
    if (cached && cached.expiresAt > now()) {
      return cached.authenticated
        ? { authenticated: true }
        : { authenticated: false, error: 'Invalid bearer token' };
    }
    cache.delete(token);

    const existing = pending.get(token);
    if (existing) return existing;
    if (pending.size >= maxPending) return { authenticated: false, error: 'Authentication busy' };

    const verification = (async (): Promise<AuthResult> => {
      try {
        const response = await fetcher(`${engineUrl}${validationPath}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(3000),
        });
        cacheResult(token, response.ok);
        return response.ok
          ? { authenticated: true }
          : { authenticated: false, error: 'Invalid bearer token' };
      } catch {
        return { authenticated: false, error: 'Authentication service unavailable' };
      } finally {
        pending.delete(token);
      }
    })();
    pending.set(token, verification);
    return verification;
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
