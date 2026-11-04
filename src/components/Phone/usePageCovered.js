import { useEffect, useState } from 'react';

// Something modal covering the page, and with it the top bar: an open MUI
// Dialog or Drawer (the route wizard, a route's details on a phone...), as
// MUI portals them into <body>. Menus and popovers do not cover the page, a
// drawer kept mounted while closed is `MuiModal-hidden`, and the phone's own
// drawer is the phone, not a cover (data-phone-drawer).
const COVER = ':scope > .MuiModal-root:not(.MuiPopover-root):not(.MuiModal-hidden):not([data-phone-drawer])';
const covered = () => Boolean(document.body.querySelector(COVER));

/** Whether a dialog or drawer covers the page (and the top bar). */
export default function usePageCovered() {
  const [isCovered, setCovered] = useState(covered);
  useEffect(() => {
    const observer = new MutationObserver(() => setCovered(covered()));
    // A modal mounting or unmounting is a child of <body> coming or going.
    observer.observe(document.body, { childList: true });
    // One kept mounted (a drawer) only opens and closes; MUI marks the app's
    // root aria-hidden while any modal is open, so that one attribute tells.
    const appRoot = document.getElementById('root');
    if (appRoot) observer.observe(appRoot, { attributes: true, attributeFilter: ['aria-hidden'] });
    setCovered(covered());
    return () => observer.disconnect();
  }, []);
  return isCovered;
}
