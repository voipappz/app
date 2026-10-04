import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import i18n, { DEFAULT_LANGUAGE, directionFor, normalizeLanguage } from './index';
import { createAppTheme } from '../theme/theme';

const LocaleContext = createContext();

export const LANGUAGE_STORAGE_KEY = 'app-language';
/**
 * Whether the stored language was CHOSEN or merely inherited from the
 * customer. Only an explicit choice outranks the customer's default, so the
 * two cases cannot share one value. See LocaleSync.
 */
export const LANGUAGE_SOURCE_KEY = 'app-language-source';

const readStored = () => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored ? normalizeLanguage(stored) : DEFAULT_LANGUAGE;
  } catch {
    // Storage blocked (private window, embedded frame): fall back rather than
    // taking the app down on a preference.
    return DEFAULT_LANGUAGE;
  }
};

// Two caches, built once. Passing `stylisPlugins` REPLACES Emotion's defaults,
// so `prefixer` has to be listed explicitly — omit it and every vendor prefix
// silently disappears. rtlPlugin is what mirrors the ~226 `ml:`/`mr:`/`pl:`/
// `pr:` sx declarations across the app for free; it does NOT touch plain .css
// files, which are converted to logical properties by hand instead.
const ltrCache = createCache({ key: 'mui', stylisPlugins: [prefixer] });
const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });

/**
 * LocaleProvider — language, direction, the matching Emotion cache and the
 * matching MUI theme.
 *
 * It OWNS MuiThemeProvider rather than sitting beside it, for two reasons that
 * are easy to get wrong:
 *
 *  - `direction` is a top-level createTheme option, so the theme has to be
 *    rebuilt per direction (hence createAppTheme) rather than mutated;
 *  - the Emotion cache has to be in place BEFORE those styles are inserted,
 *    so CacheProvider must wrap MuiThemeProvider, not the reverse.
 *
 * Deliberately shaped like ThemeContext: one storage key, an effect that
 * applies the value to <html> and persists it, a `storage` listener for other
 * tabs, and a throw-if-missing hook. Reviewers already know that file.
 *
 * ThemeContext still mounts INSIDE this, because it calls MUI's
 * useColorScheme() and needs the MUI provider above it.
 */
export const LocaleProvider = ({ children }) => {
  const [language, setLanguageState] = useState(readStored);
  const direction = directionFor(language);

  const cache = direction === 'rtl' ? rtlCache : ltrCache;
  const theme = useMemo(() => createAppTheme(direction), [direction]);

  useEffect(() => {
    // index.html sets these before first paint so a Hebrew session does not
    // flash LTR on reload; this keeps them true after a change.
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* storage blocked */ }
    if (i18n.language !== language) i18n.changeLanguage(language);
  }, [language, direction]);

  // Another tab changed the language; follow it, exactly as ThemeContext does.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== LANGUAGE_STORAGE_KEY || !e.newValue) return;
      setLanguageState(normalizeLanguage(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /**
   * @param next   the language to switch to
   * @param source 'user' for an explicit choice, 'customer' for a tenant
   *               default. Only 'user' is permanent — see LocaleSync.
   */
  const setLanguage = useCallback((next, source = 'user') => {
    const normalized = normalizeLanguage(next);
    try { localStorage.setItem(LANGUAGE_SOURCE_KEY, source); } catch { /* storage blocked */ }
    setLanguageState(normalized);
  }, []);

  const value = useMemo(() => ({
    language,
    direction,
    isRtl: direction === 'rtl',
    setLanguage,
  }), [language, direction, setLanguage]);

  return (
    <LocaleContext.Provider value={value}>
      <CacheProvider value={cache}>
        {/* modeStorageKey/defaultMode match ThemeContext, so MUI's own mode
            state boots in step with the app's `data-theme`. */}
        <MuiThemeProvider theme={theme} modeStorageKey="theme-preference" defaultMode="light" disableTransitionOnChange>
          {children}
        </MuiThemeProvider>
      </CacheProvider>
    </LocaleContext.Provider>
  );
};

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
};
