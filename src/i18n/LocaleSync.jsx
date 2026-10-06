import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from './LocaleContext';
import { isChosenByUser } from './languageStorage';
import { loadCustomerData } from '../services/customerService';

// After an account signs in, use the customer's language as the default, unless
// someone on this browser already picked a language by hand. Renders nothing.
//
// Account sessions only for now: loadCustomerData() sends the account token, so
// it cannot read the customer's settings for a user session.
export default function LocaleSync() {
  const { isAuthenticated } = useAuth();
  const { setLanguage } = useLocale();
  const appliedThisSession = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      appliedThisSession.current = false;
      return;
    }
    if (appliedThisSession.current || isChosenByUser()) return;
    appliedThisSession.current = true;

    loadCustomerData()
      .then((customer) => {
        if (customer?.language) setLanguage(customer.language, 'customer');
      })
      .catch(() => { /* keep the current language */ });
  }, [isAuthenticated, setLanguage]);

  return null;
}
