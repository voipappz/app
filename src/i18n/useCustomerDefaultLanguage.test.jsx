import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { LocaleProvider } from './LocaleContext';
import useCustomerDefaultLanguage from './useCustomerDefaultLanguage';

const Probe = ({ customerLanguage }) => {
  useCustomerDefaultLanguage(customerLanguage);
  return null;
};

const renderWithCustomer = (customerLanguage) =>
  render(<LocaleProvider><Probe customerLanguage={customerLanguage} /></LocaleProvider>);

beforeEach(() => localStorage.clear());

describe('useCustomerDefaultLanguage', () => {
  it("uses the customer's language when nobody picked one", () => {
    renderWithCustomer('he');
    expect(document.documentElement.lang).toBe('he');
    expect(localStorage.getItem('app-language-source')).toBe('customer');
  });

  it('never overrides a language picked by hand', () => {
    localStorage.setItem('app-language', 'en');
    localStorage.setItem('app-language-source', 'user');
    renderWithCustomer('he');
    expect(document.documentElement.lang).toBe('en');
  });
});
