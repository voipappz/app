import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../../i18n';
import { loginErrorText } from './loginErrors';

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
