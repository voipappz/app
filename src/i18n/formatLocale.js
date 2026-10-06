import i18n from './index';

// The locale Intl formats dates and numbers with. English stays en-GB
// (day/month/year, 24-hour), which is what the app has always shown.
export const currentLocaleTag = () => (i18n.language === 'he' ? 'he-IL' : 'en-GB');
