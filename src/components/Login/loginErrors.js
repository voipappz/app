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
