import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import SignIn from './SignIn.jsx';

// The two logins keep their own forms, OTP and reset flows (and endpoints):
// here they are stand-ins that show which one is on screen.
vi.mock('./Login.jsx', () => ({ default: () => <div data-testid="account-login" /> }));
vi.mock('./UserLogin.jsx', () => ({ default: () => <div data-testid="user-login" /> }));

const at = (url, mode) => render(<MemoryRouter initialEntries={[url]}><SignIn mode={mode} /></MemoryRouter>);

describe('the sign-in page', () => {
  it('opens on the user login with no User / Account toggle', () => {
    at('/');
    expect(screen.getByTestId('user-login')).toBeInTheDocument();
    expect(screen.queryByTestId('account-login')).toBeNull();
    expect(screen.queryByTestId('sign-in-as')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Account' })).toBeNull();
  });

  it('shows the account login only on the admin door', () => {
    at('/admin', 'account');
    expect(screen.getByTestId('account-login')).toBeInTheDocument();
    expect(screen.queryByTestId('user-login')).toBeNull();
  });

  it('ignores the old ?as=account link and a remembered choice', () => {
    localStorage.setItem('sign_in_as', 'account');
    at('/?as=account');
    expect(screen.getByTestId('user-login')).toBeInTheDocument();
  });
});
