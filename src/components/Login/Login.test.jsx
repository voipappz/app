import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Login from './Login.jsx';

// The account sign-in (/admin) names itself and points users to their own page
// at `/`; the hint about the user page appears only once a sign-in has failed.
let hook = {};
vi.mock('./Login', () => ({ useLogin: () => hook }));

const show = () => render(<MemoryRouter initialEntries={['/admin']}><Login /></MemoryRouter>);

beforeEach(() => {
  hook = { email: '', password: '', touched: {}, loading: false, error: null, otpStep: false, showForgetForm: false };
});

describe('the account sign-in', () => {
  it('says it is the admin sign-in', () => {
    show();
    expect(screen.getByRole('heading', { name: /admin sign-in/i })).toBeInTheDocument();
    expect(screen.getByTestId('admin-login-badge')).toHaveTextContent('Admin');
  });

  it('links users to their own sign-in at /', () => {
    show();
    expect(screen.getByTestId('admin-login-user-link')).toHaveAttribute('href', '/');
  });

  it('suggests the user sign-in only after a failed sign-in', () => {
    show();
    expect(screen.queryByTestId('admin-login-wrong-door')).toBeNull();
    hook = { ...hook, error: 'Invalid email or password' };
    show();
    expect(screen.getByTestId('admin-login-wrong-door')).toHaveTextContent(/signing in as a user/i);
  });
});
