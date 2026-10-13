import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../i18n';
import PhoneSignIn from './PhoneSignIn.jsx';

const mockConnect = vi.fn(async () => {});
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ connect: mockConnect }) }));

const reception = {
  uuid: 'dev-1', name: 'Reception', username: '201', password: 's3cret',
  environment: { domain: '6174.nimbusip.com', wss_server: 'sbc.voipappz.io:7443' },
};
const mockGetExtensions = vi.fn(async () => ({ data: [{ uuid: 'dev-1', name: 'Reception', username: '201' }, { uuid: 'dev-2', name: 'Sales', username: '202' }] }));
const mockGetExtension = vi.fn(async () => reception);
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

afterEach(() => i18n.changeLanguage('en'));

describe('signing the admin phone in', () => {
  it('registers as the device it was opened for, without saving its password', async () => {
    render(<PhoneSignIn device={{ uuid: 'dev-1', username: '201' }} />);
    await waitFor(() => expect(mockConnect).toHaveBeenCalled());
    expect(mockGetExtension).toHaveBeenCalledWith('dev-1');
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({ username: '201', password: 's3cret', domain: '6174.nimbusip.com' }),
      { persist: false },
    );
  });

  it('registers as a device picked from the account', async () => {
    render(<PhoneSignIn />);
    fireEvent.click(await screen.findByRole('button', { name: /Reception/ }));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({ username: '201' }), { persist: false }));
  });

  // The user login only feeds the phone. Stored as a portal session it would
  // end the admin's session (sessionIsolation), so it is revoked instead.
  it('registers as a user through the portal login, and does not keep the user session', async () => {
    mockAxiosPost
      .mockResolvedValueOnce({ data: { otp_sent: true, temp_token: 'tmp' } })
      .mockResolvedValueOnce({ data: { token: 'user-jwt', user: { name: 'Dana', extension: { username: '305', password: 'ext-pw' }, environment: { domain: 'd.example', wss_server: 'wss://sbc' } } } });

    render(<PhoneSignIn />);
    fireEvent.click(screen.getByRole('tab', { name: 'User login' }));
    fireEvent.change(screen.getByLabelText('Email or extension'), { target: { value: 'dana@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({ username: '305', password: 'ext-pw' }), { persist: false }));
    expect(mockAxiosPost.mock.calls[0][0]).toBe('/auth/user_login');
    expect(mockAxiosPost.mock.calls[1][0]).toBe('/auth/user/otp/verify');
    const [path, body] = mockApiPost.mock.calls[0];
    expect(path).toBe('/auth/logout');
    expect(body.get('token')).toBe('user-jwt');
    expect(localStorage.getItem('user_auth')).toBeNull();
  });
});

describe('the phone sign-in in Hebrew', () => {
  it('shows Hebrew tabs and labels, and keeps device names as they are', async () => {
    await i18n.changeLanguage('he');
    render(<PhoneSignIn />);

    expect(screen.getByRole('tab', { name: 'מכשיר' })).toBeInTheDocument();
    expect(screen.getByLabelText('חיפוש מכשיר')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Reception/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'כניסת משתמש' }));
    expect(screen.getByLabelText('אימייל או שלוחה')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'כניסה' })).toBeInTheDocument();
  });
});
