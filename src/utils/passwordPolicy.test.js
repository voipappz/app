import { describe, it, expect } from 'vitest';
import { passwordPolicyError, isPasswordValid, generatePolicyPassword } from './passwordPolicy';

describe('passwordPolicyError', () => {
  it('rejects passwords shorter than 12 characters', () => {
    expect(passwordPolicyError('')).toMatch(/at least 12/);
    expect(passwordPolicyError('Short!pass1')).toMatch(/at least 12/);
  });

  it('rejects passwords longer than 18 characters', () => {
    expect(passwordPolicyError('Abcdefghijklmnop!12')).toMatch(/at most 18/);
  });

  it('rejects passwords without a special character', () => {
    expect(passwordPolicyError('Abcdefghijkl12')).toMatch(/special character/);
    expect(passwordPolicyError('Abcdef ghijkl12')).toMatch(/special character/);
  });

  it('accepts 12 and 18 character passwords with a special character', () => {
    expect(passwordPolicyError('Abcdefghij1!')).toBe('');
    expect(passwordPolicyError('Abcdefghijklmnop1#')).toBe('');
    expect(isPasswordValid('Abcdefghij1!')).toBe(true);
  });
});

describe('generatePolicyPassword', () => {
  it('always produces a compliant password', () => {
    for (let i = 0; i < 200; i++) expect(isPasswordValid(generatePolicyPassword())).toBe(true);
  });

  it('clamps the requested length into 12–18', () => {
    expect(generatePolicyPassword(4)).toHaveLength(12);
    expect(generatePolicyPassword(40)).toHaveLength(18);
  });
});
