import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import LocaleSync from './LocaleSync';
import { loadCustomerData } from '../services/customerService';

let signedIn = true;
const setLanguage = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: signedIn }) }));
vi.mock('./LocaleContext', () => ({ useLocale: () => ({ setLanguage }) }));
vi.mock('../services/customerService', () => ({ loadCustomerData: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  signedIn = true;
  loadCustomerData.mockResolvedValue({ language: 'he' });
});

describe('LocaleSync', () => {
  it("uses the customer's language after an account signs in", async () => {
    render(<LocaleSync />);
    await waitFor(() => expect(setLanguage).toHaveBeenCalledWith('he', 'customer'));
  });

  it('never overrides a language picked by hand', () => {
    localStorage.setItem('app-language-source', 'user');
    render(<LocaleSync />);
    expect(loadCustomerData).not.toHaveBeenCalled();
  });

  it('does nothing while nobody is signed in', () => {
    signedIn = false;
    render(<LocaleSync />);
    expect(loadCustomerData).not.toHaveBeenCalled();
  });
});
