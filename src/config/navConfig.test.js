import { describe, it, expect } from 'vitest';
import { getPermittedNavItems, getPermittedTopbarItems, findNavItemByPath, TOPBAR_NAV_ITEMS } from './navConfig';

// Nodes are managed from the customer dialog and have no route. Providers,
// Tariffs and Subscriptions (where plans are managed) are sidebar entries.
describe('navConfig Nodes', () => {
  const acl = { data: { nodes: { main: ['read', 'write'] } } };

  it('lists Nodes neither in the top-right tools nor in the sidebar', () => {
    const paths = [...getPermittedTopbarItems(acl), ...getPermittedNavItems(acl)].map((item) => item.path);
    expect(paths).not.toContain('/nodes');
    expect(findNavItemByPath('/nodes')).toBeNull();
  });
});

describe('navConfig billing and carrier screens', () => {
  const acl = { data: {
    providers: { main: ['read'] }, tariffs: { main: ['read'] }, subscriptions: { main: ['read'] },
  } };

  it('lists Providers, Tariffs and Subscriptions in the sidebar for an account with their ACL', () => {
    const items = getPermittedNavItems(acl);
    const paths = items.map((item) => item.path);
    expect(paths).toEqual(expect.arrayContaining(['/providers', '/tariffs', '/subscriptions']));
    expect(items.find((item) => item.path === '/providers')).toMatchObject({ text: 'Providers', aclKey: 'providers', labelKey: 'nav:providers' });
    expect(items.find((item) => item.path === '/tariffs')).toMatchObject({ text: 'Tariffs', aclKey: 'tariffs', labelKey: 'nav:tariffs' });
  });

  it('hides each from an account whose ACL does not grant it', () => {
    const paths = getPermittedNavItems({ data: { calls: { main: ['read'] } } }).map((item) => item.path);
    expect(paths).not.toContain('/providers');
    expect(paths).not.toContain('/tariffs');
    expect(paths).not.toContain('/subscriptions');
  });

  it('keeps Providers out of the top-right tools', () => {
    expect(getPermittedTopbarItems(acl).map((item) => item.path)).not.toContain('/providers');
  });
});
// The top bar keeps no tool icons: Events opens from a list row, Syslog from
// Monitoring's Logs view. Monitoring itself is a rail item (below Reports):
// admins open it on purpose, not only when the health dot turns red.
describe('navConfig top bar tools', () => {
  it('gives none of them an icon of its own', () => {
    expect(TOPBAR_NAV_ITEMS.filter((item) => !item.noIcon)).toEqual([]);
    expect(findNavItemByPath('/logs')).toMatchObject({ text: 'Syslog', aclKey: 'logs' });
  });

  it('lists Monitoring in the rail, after Reports, for an account with monitors access', () => {
    const acl = { data: { reports: { main: ['read'] }, monitors: { main: ['read'] } } };
    const paths = getPermittedNavItems(acl).map((item) => item.path);
    expect(paths.indexOf('/monitoring')).toBeGreaterThan(paths.indexOf('/reports'));
    expect(getPermittedTopbarItems(acl).map((item) => item.path)).not.toContain('/monitoring');
  });
});
// Live is back in the account console (it was portal-only from 8cc1555). Gated
// on `reports`: the console's ACLs carry no `dashboard` key.
describe('navConfig Live entry', () => {
  it('lists Live at /live, above Calls, for an account with reports access', () => {
    const acl = { data: { reports: { main: ['read'] }, calls: { main: ['read'] } } };
    const paths = getPermittedNavItems(acl).map((item) => item.path);
    expect(paths).toContain('/live');
    expect(paths.indexOf('/live')).toBeLessThan(paths.indexOf('/calls'));
    expect(findNavItemByPath('/live')).toMatchObject({ text: 'Live', aclKey: 'reports' });
  });

  it('hides Live from an account without reports access', () => {
    const acl = { data: { calls: { main: ['read'] } } };
    expect(getPermittedNavItems(acl).map((item) => item.path)).not.toContain('/live');
  });
});

// A portal user signs in to the same console, and shares the account's ACL
// model: the same items, filtered by the user's ACL, strictly — an item with
// no ACL key (or alwaysShow) is an account affordance and is not shown.
describe('navConfig for a user session (strict)', () => {
  // Portal ACLs spell keys singular; the check falls back to that spelling.
  const userAcl = { data: { call: { main: ['read'] }, report: { main: ['read'] } } };

  it('shows the items the user ACL grants', () => {
    const paths = getPermittedNavItems(userAcl, { strict: true }).map((i) => i.path);
    expect(paths).toContain('/calls');
    expect(paths).toContain('/live');
  });

  it('hides alwaysShow and key-less items, and what the ACL does not grant', () => {
    const paths = getPermittedNavItems(userAcl, { strict: true }).map((i) => i.path);
    expect(paths).not.toContain('/routes');      // alwaysShow for an account
    expect(paths).not.toContain('/extensions');  // not granted
    expect(getPermittedTopbarItems(userAcl, { strict: true }).map((i) => i.path)).not.toContain('/devzone'); // no key
  });

  it('shows nothing without an ACL', () => {
    expect(getPermittedNavItems(null, { strict: true })).toEqual([]);
  });
});
// Calls and Messages are one menu entry, Logs; the screen's tabs switch kind.
describe('navConfig Calls and Messages', () => {
  const acl = { data: { calls: { main: ['read'] }, messages: { main: ['read'] } } };

  it('lists Calls and Messages as two menu items', () => {
    const items = getPermittedNavItems(acl);
    expect(items.find((item) => item.path === '/calls')).toMatchObject({ text: 'Calls' });
    expect(items.find((item) => item.path === '/messages')).toMatchObject({ text: 'Messages', aclKey: 'messages' });
  });
});
