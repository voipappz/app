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
import enExtensions from './locales/en/extensions.json';
import heExtensions from './locales/he/extensions.json';
import enCalls from './locales/en/calls.json';
import heCalls from './locales/he/calls.json';
import enCallConditions from './locales/en/callConditions.json';
import heCallConditions from './locales/he/callConditions.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, nav: enNav, auth: enAuth, extensions: enExtensions, calls: enCalls, callConditions: enCallConditions },
    he: { common: heCommon, nav: heNav, auth: heAuth, extensions: heExtensions, calls: heCalls, callConditions: heCallConditions },
  },
  lng: readLanguage(), // start in the stored language, so text never flashes English
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  ns: ['common', 'nav', 'auth', 'extensions', 'calls', 'callConditions'],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
  react: { useSuspense: false }, // a suspended translation inside Layout would reset its state
});

export default i18n;
