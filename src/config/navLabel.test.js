import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../i18n';
import { NAV_ITEMS, TOPBAR_NAV_ITEMS, OFF_MENU_NAV_ITEMS, navLabel } from './navConfig';

const allItems = [...NAV_ITEMS, ...TOPBAR_NAV_ITEMS, ...OFF_MENU_NAV_ITEMS];
const t = (...args) => i18n.t(...args);

afterEach(() => i18n.changeLanguage('en'));

describe('navLabel', () => {
  it('shows every menu item exactly as before in English', () => {
    allItems.forEach((item) => expect(navLabel(t, item)).toBe(item.text));
  });

  it('has a Hebrew name for every menu item', async () => {
    await i18n.changeLanguage('he');
    allItems.forEach((item) => expect(navLabel(t, item)).not.toBe(item.text));
  });
});
