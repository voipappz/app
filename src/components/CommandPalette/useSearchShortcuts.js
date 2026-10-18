import { useEffect } from 'react';

// Is the keystroke going into something that reads text?
const isTyping = (el) => {
  if (!el || el === document.body || el === document) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.('[contenteditable]:not([contenteditable="false"])'));
};

/**
 * The two keys that open the global search: Ctrl+K / ⌘K anywhere, and `/`
 * when focus is not inside an input, textarea or contenteditable (so typing a
 * slash into a field never steals it). `open` is the palette's own state, so
 * `/` typed into the palette's input is left alone.
 */
export function useSearchShortcuts(openSearch, open = false) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
        return;
      }
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (open || isTyping(e.target) || e.target?.closest?.('[role="dialog"]')) return;
      e.preventDefault();
      openSearch();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openSearch, open]);
}
