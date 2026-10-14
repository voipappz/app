import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhoneSignIn from './PhoneSignIn.jsx';

// The phone signs in as a DEVICE: the context fetches that device's phone
// token. Nothing here handles a SIP username or password.
const mockSignInDevice = vi.fn(async () => {});
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ signInDevice: mockSignInDevice }) }));

const mockGetExtensions = vi.fn(async () => ({ data: [{ uuid: 'dev-1', name: 'Reception', username: '201' }, { uuid: 'dev-2', name: 'Sales', username: '202' }] }));
const mockGetExtension = vi.fn();
vi.mock('../../services/api/extensionsApi', () => ({
  extensionsApi: { getExtensions: (...a) => mockGetExtensions(...a), getExtension: (...a) => mockGetExtension(...a) },
}));

const mockAxiosPost = vi.fn();
vi.mock('axios', () => ({ default: { post: (...a) => mockAxiosPost(...a) } }));
const mockApiPost = vi.fn(async () => ({}));
vi.mock('../../services/apiService', () => ({ apiService: { post: (...a) => mockApiPost(...a) } }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('signing the admin phone in', () => {
  it('signs in as the device it was opened for, from its token, without saving it', async () => {
    render(<PhoneSignIn device={{ uuid: 'dev-1', username: '201' }} />);
    await waitFor(() => expect(mockSignInDevice).toHaveBeenCalledWith('dev-1', { persist: false }));
    // The device's plain record (with its SIP secret) is never fetched.
    expect(mockGetExtension).not.toHaveBeenCalled();
  });

  it('signs in as a device picked from the account', async () => {
    render(<PhoneSignIn />);
    fireEvent.click(await screen.findByRole('button', { name: /Reception/ }));
    await waitFor(() => expect(mockSignInDevice).toHaveBeenCalledWith('dev-1', { persist: false }));
  });

  // The user login only feeds the phone. Stored as a portal session it would
  // end the admin's session (sessionIsolation), so it is revoked instead.
  it('signs in as a user\'s extension through the portal login, and does not keep the user session', async () => {
    mockAxiosPost
      .mockResolvedValueOnce({ data: { otp_sent: true, temp_token: 'tmp' } })
      .mockResolvedValueOnce({ data: { token: 'user-jwt', user: { name: 'Dana', extension: { uuid: 'ext-305', username: '305' } } } });

    render(<PhoneSignIn />);
    fireEvent.click(screen.getByRole('tab', { name: 'User login' }));
    fireEvent.change(screen.getByLabelText('Email or extension'), { target: { value: 'dana@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    // The user's login fetches the phone token once, then is revoked.
    await waitFor(() => expect(mockSignInDevice).toHaveBeenCalledWith('ext-305', { persist: false, authorization: 'Bearer user-jwt' }));
    expect(mockAxiosPost.mock.calls[0][0]).toBe('/auth/user_login');
    expect(mockAxiosPost.mock.calls[1][0]).toBe('/auth/user/otp/verify');
    const [path, body] = mockApiPost.mock.calls[0];
    expect(path).toBe('/auth/logout');
    expect(body.get('token')).toBe('user-jwt');
    expect(localStorage.getItem('user_auth')).toBeNull();
  });
});
