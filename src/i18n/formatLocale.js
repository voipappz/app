import { he } from 'date-fns/locale/he';
import i18n from './index';

// The locale Intl formats dates and numbers with. English stays en-GB
// (day/month/year, 24-hour), which is what the app has always shown.
export const currentLocaleTag = () => (i18n.language === 'he' ? 'he-IL' : 'en-GB');

// The same for date-fns `format`: Hebrew month names under Hebrew, its English default otherwise.
export const currentDateFnsLocale = () => (i18n.language === 'he' ? he : undefined);
