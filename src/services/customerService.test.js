import { describe, it, expect, beforeEach } from 'vitest';
import { applySavedCustomerBranding, getCustomerData } from './customerService.js';

describe('applySavedCustomerBranding', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('applies a just-saved colour over the cached one', () => {
    localStorage.setItem('customerData', JSON.stringify({ name: 'Acme', logo_color: '#112233' }));

    applySavedCustomerBranding({ logo_color: '#e53935', language: 'en' });

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--accent-color')).toBe('#e53935');
    expect(root.getPropertyValue('--accent-primary')).toBe('#e53935');
    expect(getCustomerData()).toMatchObject({ name: 'Acme', logo_color: '#e53935' });
  });

  it('keeps the cached branding when the profile has none', () => {
    localStorage.setItem('customerData', JSON.stringify({ name: 'Acme', logo_color: '#112233' }));

    applySavedCustomerBranding({ language: 'en' });

    expect(getCustomerData().logo_color).toBe('#112233');
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('#112233');
  });
});
