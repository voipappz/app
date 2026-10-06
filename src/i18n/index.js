import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages';
import { readLanguage } from './languageStorage';
import enCommon from './locales/en/common.json';
import heCommon from './locales/he/common.json';
import enNav from './locales/en/nav.json';
import heNav from './locales/he/nav.json';
import enAuth from './locales/en/auth.json';
import heAuth from './locales/he/auth.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, nav: enNav, auth: enAuth },
    he: { common: heCommon, nav: heNav, auth: heAuth },
  },
  lng: readLanguage(), // start in the stored language, so text never flashes English
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  ns: ['common', 'nav', 'auth'],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
  react: { useSuspense: false }, // a suspended translation inside Layout would reset its state
});

export default i18n;
