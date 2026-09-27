import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import theme from '../../theme/theme';
import UserLogin from './UserLogin.jsx';

vi.mock('./UserLogin', () => ({
  useUserLogin: () => new Proxy({ email: '', password: '', touched: {}, loading: false, error: null, otpStep: false, showForgetForm: false }, {
    get: (target, key) => (key in target ? target[key] : vi.fn()),
  }),
}));
vi.mock('../../services/customerPortalService', () => ({ loadCustomerPortalData: () => Promise.resolve(null) }));

// The console's theme makes fields small by default; the sign-in form is the
// one place they stay full size.
describe('UserLogin', () => {
  it('renders full-size fields under the console theme', () => {
    render(<ThemeProvider theme={theme}><UserLogin /></ThemeProvider>);

    const inputs = screen.getByTestId('user-login-form').querySelectorAll('.MuiInputBase-root');
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => expect(input).not.toHaveClass('MuiInputBase-sizeSmall'));
  });
});
