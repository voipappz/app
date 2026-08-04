// The ACL is now the ONLY source of permissions, so this conversion decides
// what every user can see. A screen name that fails to map does not degrade —
// it disappears from the app. These pin the shapes the mothership actually
// sends, and the aliases that keep a rename from locking people out.
import { describe, it, expect } from 'vitest';
import { permissionsFromAcl } from './aclPermissions';

describe('permissionsFromAcl', () => {
  // The live shape: acl.data, actions comma-separated under `main`.
  it('reads the current API format (data → screen → main)', () => {
    const granted = permissionsFromAcl({
      data: { calls: { main: 'read,write' }, dashboard: { main: 'read' } },
    });
    expect(granted).toContain('calls:read');
    expect(granted).toContain('calls:write');
    expect(granted).toContain('dashboard:read');
  });

  it('reads the screens format with array actions', () => {
    const granted = permissionsFromAcl({ screens: { calls: ['read', 'write'] } });
    expect(granted).toEqual(expect.arrayContaining(['calls:read', 'calls:write']));
  });

  it('reads the legacy direct format', () => {
    expect(permissionsFromAcl({ calls: 'read' })).toEqual(['calls:read']);
  });

  // THE lockout trap: the mothership says `report`, this app says `reports`
  // everywhere (routes, menu, ROLE_TEMPLATES). Without the alias the Reports
  // page vanishes for every user the moment ACLs start being enforced.
  it('maps the server\'s `report` onto this app\'s `reports`', () => {
    expect(permissionsFromAcl({ data: { report: { main: 'read' } } })).toEqual(['reports:read']);
  });

  // Different endpoints spell "can see the list" differently; the app gates on
  // :read alone, so they all have to collapse onto it.
  it('collapses index/list/show onto read', () => {
    const granted = permissionsFromAcl({ data: { calls: ['index'], dashboard: ['list'], reports: ['show'] } });
    expect(granted).toEqual(expect.arrayContaining(['calls:read', 'dashboard:read', 'reports:read']));
  });

  it('keeps non-read verbs as themselves', () => {
    expect(permissionsFromAcl({ data: { calls: ['write', 'delete'] } }))
      .toEqual(expect.arrayContaining(['calls:write', 'calls:delete']));
  });

  it('gathers actions from sibling keys, not just `main`', () => {
    const granted = permissionsFromAcl({ data: { calls: { main: 'read', extra: 'write' } } });
    expect(granted).toEqual(expect.arrayContaining(['calls:read', 'calls:write']));
  });

  it('does not repeat a permission granted twice', () => {
    const granted = permissionsFromAcl({ data: { calls: { main: 'read', other: 'index' } } });
    expect(granted.filter((p) => p === 'calls:read')).toHaveLength(1);
  });

  // Deny by default: an absent or unusable ACL grants NOTHING. It must never
  // quietly widen into the old wildcard.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['a string', 'admin'],
    ['an array', ['read']],
  ])('grants nothing for %s', (_label, acl) => {
    expect(permissionsFromAcl(acl)).toEqual([]);
  });

  it('never emits a wildcard, whatever the server sends', () => {
    const granted = permissionsFromAcl({ data: { '*': { main: '*' }, calls: { main: 'read' } } });
    expect(granted).not.toContain('*');
    expect(granted).toContain('calls:read');
  });
});
