import { currentLocaleTag } from '../i18n/formatLocale';

// Numbers in the active language, e.g. 1234567 -> "1,234,567".
export const formatNumber = (value, options) =>
  new Intl.NumberFormat(currentLocaleTag(), options).format(value);
