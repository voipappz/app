import { describe, it, expect } from 'vitest';
import { getPermittedNavItems, getPermittedTopbarItems, findNavItemByPath, TOPBAR_NAV_ITEMS } from './navConfig';

// Nodes and Providers left the top-right tools: nodes are managed from the
// customer dialog, providers open from Routes.
describe('navConfig Nodes and Providers', () => {
  const acl = { data: { nodes: { main: ['read', 'write'] }, providers: { main: ['read', 'write'] } } };

  it('lists neither in the top-right tools nor in the sidebar', () => {
    const paths = [...getPermittedTopbarItems(acl), ...getPermittedNavItems(acl)].map((item) => item.path);
    expect(paths).not.toContain('/nodes');
    expect(paths).not.toContain('/providers');
  });

  it('still names the Providers route for breadcrumbs and recent pages', () => {
    expect(findNavItemByPath('/providers')).toMatchObject({ text: 'Providers', aclKey: 'providers' });
    expect(findNavItemByPath('/nodes')).toBeNull();
  });
});
// The top bar keeps no tool icons: Events opens from a list row, Monitoring
// from the health dot, Syslog from Monitoring's Logs view.
describe('navConfig top bar tools', () => {
  it('gives none of them an icon of its own', () => {
    expect(TOPBAR_NAV_ITEMS.filter((item) => !item.noIcon)).toEqual([]);
    expect(findNavItemByPath('/logs')).toMatchObject({ text: 'Syslog', aclKey: 'logs' });
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
