export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'he'];

// 'he-IL' -> 'he'. Anything we don't ship falls back to English.
export const normalizeLanguage = (language) => {
  const primary = String(language || '').toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(primary) ? primary : DEFAULT_LANGUAGE;
};

export const directionFor = (language) => (normalizeLanguage(language) === 'he' ? 'rtl' : 'ltr');
