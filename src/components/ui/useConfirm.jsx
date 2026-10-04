import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import i18n from '../../i18n';
import ConfirmDialog from './ConfirmDialog.jsx';

/**
 * useConfirm — a promise-returning replacement for window.confirm.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete template', entityName: t.name })) remove(t);
 *
 * Resolves true on confirm, false on cancel/Esc/backdrop. One dialog is
 * mounted by <ConfirmProvider> (App.jsx), so a screen needs no state of its
 * own. Screens that must show a spinner while the action runs keep using
 * <ConfirmDialog> directly with `loading`.
 */
const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  // A second confirm() while one is open answers the first with false rather
  // than dropping its resolver — an awaited call that never settles leaves the
  // caller (and often a spinner) stuck for good.
  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOptions(opts);
  }), []);

  // Same reason, for a provider that unmounts with a dialog still open.
  useEffect(() => () => resolver.current?.(false), []);

  const settle = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        {...(options || {})}
        open={Boolean(options)}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  );
};

// Outside a provider (a component rendered on its own, as unit tests do) it
// degrades to window.confirm with the same text, so behaviour — and any test
// that stubs window.confirm — is unchanged there.
//
// Translated through the i18next singleton rather than useTranslation: this is
// a plain function, not a component, so it cannot use a hook. Same reason
// dateUtils reads the singleton. Every defaultValue is the exact English this
// used to hardcode.
const fallback = async (opts = {}) => {
  const t = i18n.t.bind(i18n);
  const question = typeof opts.message === 'string' ? opts.message
    : opts.entityName
      ? `${opts.title || t('common:action.delete', { defaultValue: 'Delete' })} ${opts.entityName}?`
      : opts.title || t('common:confirm.title', { defaultValue: 'Are you sure?' });
  // Keep the consequence line: the dialog shows it by default, so a fallback
  // that dropped it warned the user less than the dialog would have.
  const description = opts.description === undefined
    ? t('common:confirm.description', { defaultValue: 'This action cannot be undone.' })
    : opts.description;
  return window.confirm([question, typeof description === 'string' ? description : null]
    .filter(Boolean).join('\n\n'));
};

export const useConfirm = () => useContext(ConfirmContext) || fallback;

export default useConfirm;
