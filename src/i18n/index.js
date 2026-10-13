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
import enRoutes from './locales/en/routes.json';
import heRoutes from './locales/he/routes.json';
import enBridges from './locales/en/bridges.json';
import heBridges from './locales/he/bridges.json';
import enPhone from './locales/en/phone.json';
import hePhone from './locales/he/phone.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, nav: enNav, auth: enAuth, extensions: enExtensions, calls: enCalls, callConditions: enCallConditions, routes: enRoutes, bridges: enBridges, phone: enPhone },
    he: { common: heCommon, nav: heNav, auth: heAuth, extensions: heExtensions, calls: heCalls, callConditions: heCallConditions, routes: heRoutes, bridges: heBridges, phone: hePhone },
  },
  lng: readLanguage(), // start in the stored language, so text never flashes English
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  ns: ['common', 'nav', 'auth', 'extensions', 'calls', 'callConditions', 'routes', 'bridges', 'phone'],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
  react: { useSuspense: false }, // a suspended translation inside Layout would reset its state
});

export default i18n;
