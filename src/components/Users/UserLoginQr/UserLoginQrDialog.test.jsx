import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UserLoginQrDialog, { loginLinkFor } from './UserLoginQrDialog.jsx';
import { usersApi } from '../../../services/api/usersApi';

vi.mock('../../../services/api/usersApi', () => ({
  usersApi: { createLoginToken: vi.fn() },
}));

const user = { uuid: 'u-1', name: 'Dana', email: 'dana@acme.test' };

describe('UserLoginQrDialog', () => {
  it('asks the API for a sign-in code and shows it as a QR with its expiry', async () => {
    usersApi.createLoginToken.mockResolvedValue({ token: 'jwt.abc', expires_at: Math.floor(Date.now() / 1000) + 600 });
    render(<UserLoginQrDialog open user={user} onClose={vi.fn()} />);

    const qr = await screen.findByTestId('user-login-qr');
    expect(usersApi.createLoginToken).toHaveBeenCalledWith('u-1');
    expect(qr.querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('user-login-qr-expiry')).toHaveTextContent(/Expires in (9:5\d|10:00), works once/);
  });

  it('issues a fresh code on New code', async () => {
    usersApi.createLoginToken.mockResolvedValue({ token: 'jwt.abc', expires_at: Math.floor(Date.now() / 1000) + 600 });
    render(<UserLoginQrDialog open user={user} onClose={vi.fn()} />);
    await screen.findByTestId('user-login-qr');

    await userEvent.setup().click(screen.getByRole('button', { name: 'New code' }));
    await waitFor(() => expect(usersApi.createLoginToken).toHaveBeenCalledTimes(2));
  });

  it('says so when the code cannot be created', async () => {
    usersApi.createLoginToken.mockRejectedValue(new Error('403'));
    render(<UserLoginQrDialog open user={user} onClose={vi.fn()} />);

    expect(await screen.findByText('Could not create a sign-in code. Please try again.')).toBeInTheDocument();
  });

  it('links to this console sign-in page with the code', () => {
    expect(loginLinkFor('a.b+c', 'https://portal.acme.test')).toBe('https://portal.acme.test/?login_token=a.b%2Bc');
  });
});
