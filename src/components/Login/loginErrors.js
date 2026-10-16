// The server answers in English. The sign-in failures people see most get our
// own translation; any other server message is shown exactly as sent.
const KNOWN_SERVER_MESSAGES = {
  'invalid email or password': 'error.invalidCredentials',
};

export const loginErrorText = (t, error) => {
  const message = error.response?.data?.message || error.response?.data?.error;
  if (!message) return t('error.loginFailed');
  const key = KNOWN_SERVER_MESSAGES[String(message).trim().toLowerCase()];
  return key ? t(key) : message;
};

// The user sign-in speaks plainly, and warns about the lockout before the last
// try when (and only when) the API says how many tries are left.
export const userLoginErrorText = (t, error) => {
  const data = error.response?.data || {};
  const message = data.message || data.error;
  const invalid = message && KNOWN_SERVER_MESSAGES[String(message).trim().toLowerCase()];
  const base = invalid ? t('error.userInvalidCredentials') : loginErrorText(t, error);
  const left = Number(data.remaining_attempts ?? data.attempts_remaining);
  return invalid && left === 1 ? `${base} ${t('error.lastTry')}` : base;
};
