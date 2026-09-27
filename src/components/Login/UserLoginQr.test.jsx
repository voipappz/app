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

// Users → Sign-in QR links to /?login_token=<single-use JWT>.
describe('sign-in by QR code', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?login_token=qr.jwt.1');
    post.mockResolvedValue({ data: { user: { uuid: 'u-1' }, token: 'session.jwt' } });
  });
  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('trades the code once for a session and takes it out of the address bar', async () => {
    const { result, rerender } = renderHook(() => useUserLogin());
    expect(result.current.qrSigningIn).toBe(true);
    expect(window.location.search).toBe('');

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
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => useUserLogin());
    expect(result.current.qrSigningIn).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});
