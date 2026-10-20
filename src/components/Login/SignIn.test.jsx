import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import SignIn from './SignIn.jsx';

// The two logins keep their own forms, OTP and reset flows (and endpoints):
// here they are stand-ins that show which one is on screen and the toggle.
vi.mock('./Login.jsx', () => ({ default: ({ switcher }) => <div data-testid="account-login">{switcher}</div> }));
vi.mock('./UserLogin.jsx', () => ({ default: ({ switcher }) => <div data-testid="user-login">{switcher}</div> }));

const at = (url) => render(<MemoryRouter initialEntries={[url]}><SignIn /></MemoryRouter>);

beforeEach(() => localStorage.clear());

describe('the one sign-in page', () => {
  it('opens on the user login', () => {
    at('/');
    expect(screen.getByTestId('user-login')).toBeInTheDocument();
    expect(screen.queryByTestId('account-login')).toBeNull();
  });

  it('opens on the account login when the link asks for it', () => {
    at('/?as=account');
    expect(screen.getByTestId('account-login')).toBeInTheDocument();
  });

  it('toggles between the user and the account login', () => {
    at('/');
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByTestId('account-login')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'User' }));
    expect(screen.getByTestId('user-login')).toBeInTheDocument();
  });

  it('remembers the last choice in this browser', () => {
    const first = at('/');
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    first.unmount();
    at('/');
    expect(screen.getByTestId('account-login')).toBeInTheDocument();
  });
});
