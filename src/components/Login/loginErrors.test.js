import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../../i18n';
import { loginErrorText, userLoginErrorText } from './loginErrors';

const t = (key) => i18n.t(key, { ns: 'auth' });
const serverSays = (message) => ({ response: { data: { message } } });

afterEach(() => i18n.changeLanguage('en'));

describe('loginErrorText', () => {
  it('shows the wrong-password message as before in English', () => {
    expect(loginErrorText(t, serverSays('Invalid email or password'))).toBe('Invalid email or password');
  });

  it('translates the wrong-password message into Hebrew', async () => {
    await i18n.changeLanguage('he');
    expect(loginErrorText(t, serverSays('Invalid email or password'))).toBe('האימייל או הסיסמה שגויים');
  });

  it('shows any other server message exactly as sent', async () => {
    await i18n.changeLanguage('he');
    expect(loginErrorText(t, serverSays('Account locked for 15 minutes'))).toBe('Account locked for 15 minutes');
  });

  it('falls back to our own message when the server says nothing', () => {
    expect(loginErrorText(t, {})).toBe('Login failed. Please try again.');
  });
});

describe('userLoginErrorText', () => {
  const t2 = (key) => i18n.t(key, { ns: 'auth' });
  it('says a wrong password in plain words', () => {
    expect(userLoginErrorText(t2, serverSays('Invalid email or password'))).toBe("That email and password don't match. Try again, or reset your password.");
  });
  it('warns about the lockout before the last try when the API says how many are left', () => {
    const err = { response: { data: { message: 'Invalid email or password', remaining_attempts: 1 } } };
    expect(userLoginErrorText(t2, err)).toContain('15 minutes');
  });
  it('stays silent about tries when the API does not say', () => {
    expect(userLoginErrorText(t2, serverSays('Invalid email or password'))).not.toContain('15 minutes');
  });
  it('keeps other server messages as sent', () => {
    expect(userLoginErrorText(t2, serverSays('Account locked for 15 minutes'))).toBe('Account locked for 15 minutes');
  });
});
