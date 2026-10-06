// The browser tab says which side is signed in: "Admin · <brand>" or
// "User · <brand>". The role leads so it survives a narrow tab, and a previous
// role is replaced rather than stacked when branding or the session changes.
const ROLE_LABELS = { admin: 'Admin', user: 'User' };
const ROLE_PREFIX = /^(Admin|User) · /;

export function titleForRole(title, role) {
  const base = String(title || '').replace(ROLE_PREFIX, '');
  const label = ROLE_LABELS[role];
  return label ? `${label} · ${base}` : base;
}
