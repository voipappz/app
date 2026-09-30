import { jwtDecode } from 'jwt-decode';

/**
 * DEBUG ONLY — dump what a login actually produced.
 *
 * Both surfaces call this so the two session kinds print the same shape and can
 * be told apart at a glance:
 *
 *   'account' — the admin console  (Account on the sign-in at /; useLogin     -> AuthContext)
 *   'user'    — the end-user portal (User on the sign-in at /;    useUserLogin -> UserAuthContext)
 *
 * The two are genuinely different objects, not two views of one thing: an
 * account's identity lives ONLY inside the signed access token (the
 * /auth/otp/verify response body omits it), while a portal user's profile lives
 * ONLY in the login response body — its token is just { user_uuid, exp }. So
 * `subject` is read from a different place per kind, and both are printed.
 *
 * To silence this in production builds, wrap the body in
 * `if (!import.meta.env.DEV) return;`
 */

const KINDS = {
  account: { label: 'ACCOUNT — admin console', color: '#5c6bc0' },
  user: { label: 'USER — end-user portal', color: '#26a69a' },
};

export const logLoginDebug = (kind, { token, response, authData, parsed } = {}) => {
  const meta = KINDS[kind] || { label: `UNKNOWN (${kind})`, color: '#e53935' };

  let tokenPayload;
  try {
    tokenPayload = token ? jwtDecode(token) : '(no token in response)';
  } catch (error) {
    tokenPayload = `(undecodable: ${error.message})`;
  }

  // Where the full identity object actually lives, per surface.
  const subject = kind === 'account'
    ? (tokenPayload?.account ?? tokenPayload ?? null)
    : (response?.user ?? authData?.user ?? null);

  console.groupCollapsed(
    `%c[LOGIN DEBUG] ${meta.label}`,
    `color:${meta.color};font-weight:bold`
  );
  console.log('session kind       :', kind);
  console.log('subject (full)     :', subject);
  if (parsed !== undefined) {
    console.log('parsed (app shape) :', parsed);
  }
  console.log('stored authData    :', authData ?? null);
  console.log('decoded token      :', tokenPayload);
  console.log('raw response body  :', response ?? null);
  console.groupEnd();
};

export default logLoginDebug;
