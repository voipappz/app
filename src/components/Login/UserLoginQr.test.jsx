import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ login: vi.fn(), setLoading: vi.fn(), setError: vi.fn() }));
const post = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({ default: { post } }));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ ...auth, loading: false, error: null }) }));
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ connect: vi.fn() }) }));
vi.mock('../../utils/loginDebug', () => ({ logLoginDebug: vi.fn() }));

import { useUserLogin } from './UserLogin';

// src/test/setup.js replaces window.location with a plain object, so the
// address bar is simulated: replaceState writes back into it.
const visit = (href) => { window.location = { href, origin: 'http://localhost:3000' }; };

// Users → Sign-in QR links to /?login_token=<single-use JWT>.
describe('sign-in by QR code', () => {
  beforeEach(() => {
    visit('http://localhost:3000/?login_token=qr.jwt.1');
    vi.spyOn(window.history, 'replaceState').mockImplementation((_s, _t, url) => visit(new URL(url, 'http://localhost:3000').href));
    post.mockResolvedValue({ data: { user: { uuid: 'u-1' }, token: 'session.jwt' } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    visit('http://localhost:3000');
  });

  it('trades the code once for a session and takes it out of the address bar', async () => {
    const { result, rerender } = renderHook(() => useUserLogin());
    expect(result.current.qrSigningIn).toBe(true);
    expect(window.location.href).toBe('http://localhost:3000/');

    await waitFor(() => expect(auth.login).toHaveBeenCalledWith(expect.objectContaining({ token: 'session.jwt' })));
    rerender();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/auth/user_qr_login', null, { params: { token: 'qr.jwt.1' } });
    expect(navigate).toHaveBeenCalledWith('/');
    await waitFor(() => expect(result.current.qrSigningIn).toBe(false));
  });

  it('says why when the code is refused', async () => {
    post.mockRejectedValue({ response: { data: { message: 'This sign-in code was already used or has expired' } } });
    renderHook(() => useUserLogin());

    await waitFor(() => expect(auth.setError).toHaveBeenCalledWith('This sign-in code was already used or has expired'));
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('does nothing without a code', () => {
    visit('http://localhost:3000/');
    const { result } = renderHook(() => useUserLogin());
    expect(result.current.qrSigningIn).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});
