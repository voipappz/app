import i18n from '../../i18n';

// The words a call's fields and values are shown with (calls.json).
//
// Column and filter names arrive in English: from the API for an account, from
// our own list (userCallColumns.js) for a portal user. English shows them
// exactly as they arrive; Hebrew shows the app's own name for that field when
// it has one, else the name as sent.

const lastPart = (key) => String(key || '').split('.').pop();

/** A field's name, e.g. ('profile.talk_duration', 'Talk Duration'). */
export function callFieldName(key, name) {
  if (i18n.language !== 'he') return name;
  const textKey = `calls:fields.${lastPart(key)}`;
  return i18n.exists(textKey) ? i18n.t(textKey) : name;
}

/**
 * A status-like value (cause, state, direction…) as a word. A value the app
 * knows is said in the active language; any other is tidied up as before
 * ("hangup_complete" → "Hangup Complete").
 */
export function callStatusWord(value) {
  const textKey = `calls:status.${String(value).toLowerCase().replace(/-/g, '_')}`;
  if (i18n.exists(textKey)) return i18n.t(textKey);
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
