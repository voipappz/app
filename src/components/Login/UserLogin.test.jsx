import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../../theme/theme';
import UserLogin from './UserLogin.jsx';

vi.mock('./UserLogin', () => ({
  useUserLogin: () => new Proxy({ email: '', password: '', touched: {}, loading: false, error: null, otpStep: false, showForgetForm: false }, {
    get: (target, key) => (key in target ? target[key] : vi.fn()),
  }),
}));
const portal = vi.hoisted(() => ({ data: null }));
vi.mock('../../services/customerPortalService', () => ({ loadCustomerPortalData: () => Promise.resolve(portal.data) }));

// The console's theme makes fields small by default; the sign-in form is the
// one place they stay full size.
describe('UserLogin', () => {
  beforeEach(() => { portal.data = null; });

  it('renders full-size fields under the console theme', () => {
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);

    const inputs = screen.getByTestId('user-login-form').querySelectorAll('.MuiInputBase-root');
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => expect(input).not.toHaveClass('MuiInputBase-sizeSmall'));
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
