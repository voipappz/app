import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserAuth } from '../context/UserAuthContext';
import { loadCustomerData } from '../services/customerService';
import { useLocale, LANGUAGE_SOURCE_KEY } from './LocaleContext';
import { normalizeLanguage } from './index';

/**
 * LocaleSync — applies the customer's default language, once, after login.
 *
 * Three sources of truth exist for language, and the order between them is the
 * whole point of this component. Highest wins:
 *
 *  1. An EXPLICIT choice by this browser. Stored with source 'user'. Never
 *     overridden — someone who picked English on a Hebrew tenant keeps
 *     English, on every login, forever.
 *  2. The customer/tenant default, `language` from /tasks/customer_portal_data.
 *     Applied only when no explicit choice exists. Re-checked on each login, so
 *     a tenant that changes its default propagates to anyone who never chose.
 *  3. 'en'. The floor, set by LocaleContext itself.
 *
 *  Note what is NOT a source: the browser's own language. A Hebrew-locale
 *  browser must not silently get a Hebrew console; English is the default
 *  until a human says otherwise.
 *
 * It is a separate leaf component rather than part of LocaleProvider because
 * of where each has to sit. LocaleProvider owns the Emotion cache and the MUI
 * theme, so it must be ABOVE everything; this needs a session, so it must be
 * BELOW both auth providers. PortalPreferencesContext reaches back into
 * ThemeContext the same way, for the same reason.
 *
 * Renders nothing.
 */
const LocaleSync = () => {
  const { setLanguage } = useLocale();
  const admin = useAuth();
  const user = useUserAuth();
  const authenticated = Boolean(admin?.isAuthenticated || user?.isAuthenticated);

  // One attempt per session. Without this, anything that re-renders this
  // component would re-apply the customer default and stamp on a choice the
  // user made mid-session.
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!authenticated) {
      appliedRef.current = false; // next login re-checks
      return;
    }
    if (appliedRef.current) return;

    // Rule 1: an explicit choice outranks the tenant. Read straight from
    // storage rather than from context, because what matters is WHERE the
    // current value came from, not what it is.
    let source = null;
    try { source = localStorage.getItem(LANGUAGE_SOURCE_KEY); } catch { /* storage blocked */ }
    if (source === 'user') {
      appliedRef.current = true;
      return;
    }

    appliedRef.current = true;
    // Cache-first and already called by Layout on login, so this is normally
    // not a request at all.
    loadCustomerData()
      .then((data) => {
        if (!data?.language) return;
        // Mark it 'customer' so a later tenant change can still move it, and
        // so an explicit choice can still outrank it.
        setLanguage(normalizeLanguage(data.language), 'customer');
      })
      .catch(() => { /* a branding lookup must never block the app */ });
  }, [authenticated, setLanguage]);

  return null;
};

export default LocaleSync;
