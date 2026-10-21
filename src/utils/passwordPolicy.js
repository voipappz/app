/**
 * Login password policy, shared by every screen that sets one (new user, new
 * account, forgot-password reset): 12–18 characters with at least one special
 * character (anything that is not a letter, digit or space).
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 18;
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*()-_=+[]{};:,.?';

export const PASSWORD_HINT = `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters, including a special character (e.g. ! @ # $ %)`;

const SPECIAL = /[^A-Za-z0-9\s]/;

/** Returns the reason the password breaks the policy, or '' when it complies. */
export function passwordPolicyError(password) {
  const value = password || '';
  if (value.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (value.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  if (!SPECIAL.test(value)) return 'Password must include a special character';
  return '';
}

export const isPasswordValid = (password) => passwordPolicyError(password) === '';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

function randomIndex(max) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}

const pick = (chars) => chars[randomIndex(chars.length)];

/** A random password that always satisfies the policy. */
export function generatePolicyPassword(length = 16) {
  const size = Math.min(Math.max(length, PASSWORD_MIN_LENGTH), PASSWORD_MAX_LENGTH);
  const all = LOWER + UPPER + DIGITS + PASSWORD_SPECIAL_CHARS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(PASSWORD_SPECIAL_CHARS)];
  while (chars.length < size) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
