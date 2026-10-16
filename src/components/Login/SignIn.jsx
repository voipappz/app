import Login from './Login.jsx';
import UserLogin from './UserLogin.jsx';

/**
 * Separate sign-in doors: `/` is the user sign-in and `/admin` the account one.
 *
 * Two logins, not one: the user login (/auth/user_login -> UserAuthContext)
 * and the account login (/auth/login -> AuthContext) are different JWTs with
 * different permissions, each with its own form, OTP and password reset. The
 * route supplies `mode`; there is no toggle. Never "try one endpoint, then the
 * other", which would send a password to the wrong door. The user form carries
 * a small link to /admin for administrators.
 */
export default function SignIn({ mode = 'user' }) {
  return mode === 'account' ? <Login /> : <UserLogin />;
}
