import { useEffect } from 'react';
import { useOptionalLocale } from './LocaleContext';
import { normalizeLanguage } from './languages';
import { isChosenByUser } from './languageStorage';

// Switches to the customer's language, unless someone on this browser already
// picked a language by hand. Used where the customer is known before sign-in.
export default function useCustomerDefaultLanguage(customerLanguage) {
  const locale = useOptionalLocale();

  useEffect(() => {
    if (!customerLanguage || !locale || isChosenByUser()) return;
    if (normalizeLanguage(customerLanguage) === locale.language) return;
    locale.setLanguage(customerLanguage, 'customer');
  }, [customerLanguage, locale]);
}
