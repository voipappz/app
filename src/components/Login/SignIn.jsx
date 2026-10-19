import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import Login from './Login.jsx';
import UserLogin from './UserLogin.jsx';

const KEY = 'sign_in_as';
const readLast = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/**
 * Separate sign-in entries: `/` is for users and `/admin` is for accounts.
 *
 * Two logins, not one: the user login (/auth/user_login -> UserAuthContext)
 * and the account login (/auth/login -> AuthContext) are different JWTs with
 * different permissions, and each keeps its own form, OTP and password reset.
 * The choice is explicit — never "try one endpoint, then the other", which
 * would send a password to the wrong door and blur the error.
 *
 * The route supplies `mode`, keeping credentials on their intended endpoint.
 */
export default function SignIn({ mode = null }) {
  const [params] = useSearchParams();
  const asked = params.get('as');
  const [as, setAs] = useState(() => mode || (asked === 'account' || asked === 'user' ? asked : readLast() === 'account' ? 'account' : 'user'));
  const effectiveMode = mode || as;

  const choose = (_, next) => {
    if (!next) return;
    setAs(next);
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  };

  const switcher = mode ? null : (
    <ToggleButtonGroup
      value={as} exclusive onChange={choose} fullWidth size="small" aria-label="Sign in as"
      data-testid="sign-in-as" sx={{ mb: 2, '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600 } }}
    >
      <ToggleButton value="user">User</ToggleButton>
      <ToggleButton value="account">Account</ToggleButton>
    </ToggleButtonGroup>
  );

  return effectiveMode === 'account' ? <Login switcher={switcher} /> : <UserLogin switcher={switcher} />;
}
