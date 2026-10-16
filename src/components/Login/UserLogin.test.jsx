import { fireEvent, render, screen } from '@testing-library/react';
import '../../i18n';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { ThemeProvider } from '@mui/material/styles';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../../theme/theme';
import UserLogin from './UserLogin.jsx';

const hookState = vi.hoisted(() => ({ otpStep: false }));
const hookSpies = vi.hoisted(() => ({ handleSubmit: null }));
vi.mock('./UserLogin', () => ({
  useUserLogin: () => new Proxy({ email: '', password: '', otpCode: '', touched: {}, loading: false, error: null, otpStep: hookState.otpStep, showForgetForm: false, qrSigningIn: false }, {
    get: (target, key) => {
      if (key === 'handleSubmit') { hookSpies.handleSubmit = hookSpies.handleSubmit || vi.fn((e) => e.preventDefault()); return hookSpies.handleSubmit; }
      return key in target ? target[key] : vi.fn();
    },
  }),
}));
const portal = vi.hoisted(() => ({ data: null }));
vi.mock('../../services/customerPortalService', () => ({ loadCustomerPortalData: () => Promise.resolve(portal.data) }));

// The console's theme makes fields small by default; the sign-in form is the
// one place they stay full size.
describe('UserLogin', () => {
  beforeEach(() => { portal.data = null; hookState.otpStep = false; hookSpies.handleSubmit = null; });

  it('renders full-size fields under the console theme', () => {
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);

    const inputs = screen.getByTestId('user-login-form').querySelectorAll('.MuiInputBase-root');
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => expect(input).not.toHaveClass('MuiInputBase-sizeSmall'));
  });

  it('has no User / Account toggle and links administrators to /admin', () => {
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);
    expect(screen.queryByTestId('sign-in-as')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in to the admin console' })).toHaveAttribute('href', '/admin');
  });

  it('submits the user form through the hook as before', () => {
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);
    fireEvent.submit(screen.getByTestId('user-login-form'));
    expect(hookSpies.handleSubmit).toHaveBeenCalled();
  });

  it('shows and hides the password', () => {
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);
    const input = screen.getByTestId('user-password-input').querySelector('input');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('offers English and Hebrew from the brand side', () => {
    render(<ThemeProvider theme={theme}><LocaleProvider><UserLogin /></LocaleProvider></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'עברית' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
  });

  it('shows the code step as six boxes', () => {
    hookState.otpStep = true;
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);
    expect(screen.getAllByRole('textbox', { name: /Digit \d/ })).toHaveLength(6);
  });

  it('shows no logo when the customer portal data has none', async () => {
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);

    await Promise.resolve();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it("shows the customer's logo from customer_portal_data", async () => {
    portal.data = { logo_url: 'https://cdn.test/acme.png', logo_title: 'Acme' };
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);

    expect(await screen.findByRole('img', { name: 'Acme' })).toHaveAttribute('src', 'https://cdn.test/acme.png');
  });
});
