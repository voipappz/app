// A route's type, named the same way everywhere it shows: the form's select,
// the list's chip and card, and the details page.

// The API's type values, mapped to their key in the `routes` namespace
// (a key cannot hold the ":" and "." the API's feature names have).
const TYPE_KEYS = {
  'feature:trunk': 'trunk',
  dst: 'dst',
  src: 'src',
  feature: 'feature',
  'feature:user.login': 'userLogin',
  'feature:user.logout': 'userLogout',
  'feature:user.available': 'userAvailable',
  'feature:user.break': 'userBreak',
  'feature:user.logged_out': 'userLoggedOut',
  'feature:spy': 'spy',
  'feature:pickup': 'pickup',
  'feature:pickup_extension': 'pickupExtension',
  'feature:follow_me': 'followMe',
  'feature:follow_me_disable': 'followMeDisable',
  'feature:caller_id_replace': 'callerIdReplace',
};

const FEATURE_PREFIX = 'feature:';

/**
 * The readable name of a route type. A type the app does not know falls back
 * to the value itself, underscores as spaces (the API also writes values that
 * are not real types, such as caller_id_number).
 * @param {Function} t - `t` of the `routes` namespace
 * @param {string} type - The API's route type
 */
export function routeTypeLabel(t, type) {
  if (!type) return '';
  const key = TYPE_KEYS[type];
  if (key) return t(`types.${key}`);
  if (type.startsWith(FEATURE_PREFIX)) {
    return t('types.featureOther', { name: type.slice(FEATURE_PREFIX.length).replace(/[._]/g, ' ') });
  }
  return type.replace(/_/g, ' ');
}

/** One line on what a route type does; undefined for a type with none. */
export function routeTypeHint(t, type) {
  const key = TYPE_KEYS[type];
  return key && key !== 'feature' ? t(`typeHints.${key}`) : undefined;
}
