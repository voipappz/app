import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import i18n from './index';
import { directionFor, normalizeLanguage } from './languages';
import { LANGUAGE_KEY, readLanguage, saveLanguage } from './languageStorage';
import { ltrCache, rtlCache } from './emotionCaches';
import { muiLocalesFor } from './muiLocales';
import { createAppTheme } from '../theme/theme';

const LocaleContext = createContext(null);

// Owns the language, and with it the text direction, the MUI theme and the
// Emotion style cache, which all depend on the direction.
export function LocaleProvider({ children }) {
  const [language, setLanguageState] = useState(readLanguage);
  const direction = directionFor(language);
  const theme = useMemo(() => createAppTheme(direction, ...muiLocalesFor(language)), [direction, language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    i18n.changeLanguage(language);
  }, [language, direction]);

  // Another tab changed the language.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === LANGUAGE_KEY) setLanguageState(normalizeLanguage(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // source: 'user' when a person picks it, 'customer' for the tenant's default.
  const setLanguage = useCallback((next, source = 'user') => {
    const nextLanguage = normalizeLanguage(next);
    saveLanguage(nextLanguage, source);
    setLanguageState(nextLanguage);
  }, []);

  const value = useMemo(
    () => ({ language, direction, isRtl: direction === 'rtl', setLanguage }),
    [language, direction, setLanguage],
  );

  return (
    <LocaleContext.Provider value={value}>
      <CacheProvider value={direction === 'rtl' ? rtlCache : ltrCache}>
        {/* modeStorageKey/defaultMode match ThemeContext, so MUI's mode boots
            in step with the app's `data-theme`. */}
        <MuiThemeProvider theme={theme} modeStorageKey="theme-preference" defaultMode="light" disableTransitionOnChange>
          {children}
        </MuiThemeProvider>
      </CacheProvider>
    </LocaleContext.Provider>
  );
}

// Same as useLocale, but null outside LocaleProvider instead of throwing: for
// small optional controls on screens that tests render on their own.
export function useOptionalLocale() {
  return useContext(LocaleContext);
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within LocaleProvider');
  return context;
}
