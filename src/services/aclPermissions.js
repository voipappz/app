// Turn the ACL the mothership actually sends into this app's permission
// strings. Ported from nimbus-admin (src/utils/jwt.js hasPermission), which
// evaluates the real per-user ACL rather than a role template.
//
// Why this exists: sessionUser() defaulted every user to the wildcard `admin`
// role because "users carry no app role yet" — but they DO carry an ACL
// (`user.acl.data`, verified live on MTN), and it was being thrown away. Every
// signed-in user therefore held every permission.
//
// The server's shapes, all of which nimbus tolerates and so does this:
//   { data:    { calls: { main: 'read,write' }, … } }   ← current API format
//   { screens: { calls: ['read','write'], … } }
//   { calls: 'read', … }                                 ← legacy, direct

// The server's screen names are not always ours. `report` (singular) is what
// the mothership sends; this app says `reports` everywhere. Without this map a
// switch to real ACLs silently hides the Reports page from everyone.
const SCREEN_ALIASES = {
  report: 'reports',
  dashboards: 'dashboard',
  user: 'users',
};

// Reading a list goes by several names depending on the endpoint's age.
const READ_ALIASES = new Set(['read', 'index', 'list', 'show', 'view']);

/** Permissions may be an array, a comma-separated string, or nested under a key. */
function actionsOf(perms) {
  if (Array.isArray(perms)) return perms.filter((p) => typeof p === 'string');
  if (typeof perms === 'string') return perms.split(',').map((p) => p.trim()).filter(Boolean);
  if (perms && typeof perms === 'object') {
    // { main: 'read,write' } — and any sibling keys, so a nested screen still
    // contributes its actions rather than being dropped.
    return Object.values(perms).flatMap((value) => actionsOf(value));
  }
  return [];
}

/**
 * `acl` → ['calls:read', 'dashboard:read', …].
 *
 * Returns [] for a missing or unusable ACL. Callers decide what an empty result
 * means; this function does not invent access.
 */
export function permissionsFromAcl(acl) {
  const data = acl?.data || acl?.screens || acl;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];

  const permissions = new Set();
  for (const [rawScreen, perms] of Object.entries(data)) {
    if (typeof rawScreen !== 'string' || !rawScreen) continue;
    const screen = SCREEN_ALIASES[rawScreen] || rawScreen;

    for (const action of actionsOf(perms)) {
      const verb = action.toLowerCase();
      // Everything that means "can see it" collapses to :read, because that is
      // what this app's routes and menu gate on.
      permissions.add(`${screen}:${READ_ALIASES.has(verb) ? 'read' : verb}`);
    }
  }
  return [...permissions];
}
