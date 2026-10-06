import { DEFAULT_LANGUAGE, normalizeLanguage } from './languages';

// Where the chosen language is kept. Today it is this browser only; a per-user
// setting from the server could replace these two functions later.
export const LANGUAGE_KEY = 'app-language';
const SOURCE_KEY = 'app-language-source'; // 'user' (picked by hand) or 'customer' (tenant default)

export const readLanguage = () => {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

export const isChosenByUser = () => {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'user';
  } catch {
    return false;
  }
};

export const saveLanguage = (language, source) => {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
    localStorage.setItem(SOURCE_KEY, source);
  } catch { /* storage blocked: the choice lasts until reload */ }
};
