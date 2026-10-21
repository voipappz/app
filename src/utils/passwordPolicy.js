/**
 * Login password rule. The SERVER owns it: the customer profile
 * (password_min_length, password_max_length, password_require_special) sets it,
 * voipappz-api enforces it on every password it accepts, and
 * /tasks/customer_portal_data publishes it as `password_policy`. This module
 * only reads that rule to describe it and to catch a bad password before the
 * request; FALLBACK is used until it loads or when the API cannot be reached.
 */
import { useEffect, useState } from 'react';
import { loadCustomerPortalData } from '../services/customerPortalService';

const FALLBACK = { min_length: 12, max_length: 18, require_special: true };
const SPECIAL_CHARS = '!@#$%^&*-_=+?';
const SPECIAL = /[^A-Za-z0-9\s]/;

let current = FALLBACK;
let loading = null;

export function loadPasswordPolicy() {
  loading ||= loadCustomerPortalData().then((data) => {
    if (data?.password_policy) current = { ...FALLBACK, ...data.password_policy };
    return current;
  });
  return loading;
}

/** The rule, re-rendering once the server's copy arrives. */
export function usePasswordPolicy() {
  const [policy, setPolicy] = useState(current);
  useEffect(() => {
    let live = true;
    loadPasswordPolicy().then((p) => live && setPolicy(p));
    return () => { live = false; };
  }, []);
  return policy;
}

export const passwordHint = (policy = current) =>
  `${policy.min_length}–${policy.max_length} characters${policy.require_special ? ', including a special character (e.g. ! @ # $ %)' : ''}`;

/** The rule as one translated sentence (auth namespace keys). */
export const passwordRuleMessage = (t, policy = current) =>
  t(policy.require_special ? 'error.passwordTooShort' : 'error.passwordTooShortNoSpecial',
    { min: policy.min_length, max: policy.max_length });

/** Returns the reason the password breaks the rule, or '' when it complies. */
export function passwordPolicyError(password, policy = current) {
  const value = password || '';
  if (value.length < policy.min_length) return `Password must be at least ${policy.min_length} characters`;
  if (value.length > policy.max_length) return `Password must be at most ${policy.max_length} characters`;
  if (policy.require_special && !SPECIAL.test(value)) return 'Password must include a special character';
  return '';
}

export const isPasswordValid = (password, policy = current) => passwordPolicyError(password, policy) === '';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

function randomIndex(max) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}

const pick = (chars) => chars[randomIndex(chars.length)];

/** A random password that satisfies the rule. */
export function generatePolicyPassword(policy = current) {
  const size = Math.min(Math.max(16, policy.min_length), policy.max_length);
  const all = LOWER + UPPER + DIGITS + SPECIAL_CHARS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL_CHARS)];
  while (chars.length < size) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
