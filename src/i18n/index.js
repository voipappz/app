/**
 * i18next, initialised once at import time.
 *
 * English is the default and the fallback: a missing Hebrew key renders the
 * English string rather than a raw `namespace:key`, so a half-translated
 * screen is merely inconsistent instead of broken.
 *
 * Resources are bundled eagerly. Lazy namespaces (i18next-resources-to-backend
 * plus a Vite glob) are worth it at a couple of thousand keys across forty
 * screens, not at the few hundred here, and they would need Suspense — which
 * is a hazard in this app, because a namespace suspending inside Layout tears
 * down its state (see the comment on `phoneOpen` in Layout.jsx). The file
 * layout is already per-namespace, so switching later is a change to this
 * file alone.
 *
 * The language set here is only the starting point. LocaleContext owns the
 * real choice — stored preference, then the customer's default, then 'en' —
 * and calls changeLanguage() once it has resolved it.
 */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enSettings from './locales/en/settings.json';
import enExtensions from './locales/en/extensions.json';
import heCommon from './locales/he/common.json';
import heNav from './locales/he/nav.json';
import heSettings from './locales/he/settings.json';
import heExtensions from './locales/he/extensions.json';

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'he'];

/**
 * Does this language read right-to-left?
 *
 * Matches on the primary subtag so regional forms ('he-IL') resolve too.
 * Deliberately wider than SUPPORTED_LANGUAGES: the customer-level `language`
 * field is free-form server data, and a value we do not translate into should
 * still lay out correctly if it is an RTL script.
 */
export const isRtlLanguage = (language) => /^(he|ar|fa|ur|yi)(-|$)/i.test(language || '');

export const directionFor = (language) => (isRtlLanguage(language) ? 'rtl' : 'ltr');

/** Narrow anything (a stored value, a server field) to a language we ship. */
export const normalizeLanguage = (language) => {
  const primary = String(language || '').toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(primary) ? primary : DEFAULT_LANGUAGE;
};

i18next.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, nav: enNav, settings: enSettings, extensions: enExtensions },
    he: { common: heCommon, nav: heNav, settings: heSettings, extensions: heExtensions },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  ns: ['common', 'nav', 'settings', 'extensions'],
  defaultNS: 'common',
  // React escapes interpolated values already; letting i18next do it too
  // turns an apostrophe in a name into `&#39;`.
  interpolation: { escapeValue: false },
  // Without this, a namespace that is still loading suspends the component
  // tree. Everything is bundled here so nothing actually loads late, but the
  // flag keeps that true if lazy namespaces arrive later.
  react: { useSuspense: false },
  // `null` from a translation file is a mistake, not a value; fall through to
  // the key's fallback instead of rendering nothing.
  returnNull: false,
});

export default i18next;
