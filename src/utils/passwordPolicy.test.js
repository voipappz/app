import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/customerPortalService', () => ({ loadCustomerPortalData: vi.fn() }));

import { loadCustomerPortalData } from '../services/customerPortalService';

const fresh = async () => {
  vi.resetModules();
  return import('./passwordPolicy');
};

beforeEach(() => vi.mocked(loadCustomerPortalData).mockReset());

describe('password policy, before the server answers', () => {
  it('falls back to 12–18 with a special character', async () => {
    const { passwordPolicyError, isPasswordValid } = await fresh();
    expect(passwordPolicyError('Short!pass1')).toMatch(/at least 12/);
    expect(passwordPolicyError('Abcdefghijklmnop!12')).toMatch(/at most 18/);
    expect(passwordPolicyError('Abcdefghijkl12')).toMatch(/special character/);
    expect(isPasswordValid('Abcdefghij1!')).toBe(true);
  });
});

describe('password policy from customer_portal_data', () => {
  it('uses the rule the server publishes', async () => {
    vi.mocked(loadCustomerPortalData).mockResolvedValue({
      password_policy: { min_length: 8, max_length: 30, require_special: false },
    });
    const { loadPasswordPolicy, passwordPolicyError, passwordHint } = await fresh();
    await loadPasswordPolicy();
    expect(passwordPolicyError('abcdefgh')).toBe('');
    expect(passwordPolicyError('abc')).toMatch(/at least 8/);
    expect(passwordHint()).toBe('8–30 characters');
  });

  it('keeps the fallback when the server is unreachable', async () => {
    vi.mocked(loadCustomerPortalData).mockResolvedValue(null);
    const { loadPasswordPolicy } = await fresh();
    expect(await loadPasswordPolicy()).toEqual({ min_length: 12, max_length: 18, require_special: true });
  });
});

describe('generatePolicyPassword', () => {
  it('always produces a password the rule accepts', async () => {
    const { generatePolicyPassword, isPasswordValid } = await fresh();
    for (let i = 0; i < 200; i++) expect(isPasswordValid(generatePolicyPassword())).toBe(true);
  });

  it('fits a server rule with a short maximum', async () => {
    const { generatePolicyPassword, isPasswordValid } = await fresh();
    const policy = { min_length: 8, max_length: 10, require_special: true };
    const pw = generatePolicyPassword(policy);
    expect(pw).toHaveLength(10);
    expect(isPasswordValid(pw, policy)).toBe(true);
  });
});
