function unwrap(value) {
  return value && typeof value === 'object' && 'data' in value ? value.data : value;
}

export function statusValue(row, names, fallback = '') {
  for (const name of names) {
    const value = unwrap(row?.[name]);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

export function normalizeUserStatus(row = {}) {
  return {
    uuid: String(statusValue(row, ['uuid', 'user_uuid', 'user.uuid', 'id'])),
    extension: String(statusValue(row, ['extension', 'extension_number', 'user.extension', 'username'])),
    availability: String(statusValue(row, ['status_name', 'status', 'user.status'], 'Unknown')),
    availabilityType: String(statusValue(row, ['status_type', 'status', 'user.status'], '')).toLowerCase().replace(/\s+/g, '_'),
    state: String(statusValue(row, ['state', 'call_state', 'user.state'], 'Unknown')),
    callCount: Number(statusValue(row, ['call_counter', 'calls_count', 'call_count', 'user.call_counter'], 0)) || 0,
    lastCallAt: statusValue(row, ['last_call_at', 'last_call_time', 'user.last_call_at'], null),
    firstCallAt: statusValue(row, ['first_call_at', 'user.first_call_at'], null),
    talkingTo: String(statusValue(row, ['talking_to_number', 'user.talking_to_number'])),
    queue: String(statusValue(row, ['active_queue_name', 'queue_name', 'user.active_queue_name'])),
    updatedAt: statusValue(row, ['state_updated_at', 'updated_at', 'user.state_updated_at'], null),
  };
}

export function findCurrentUserStatus(rows, user) {
  const candidates = [user?.user_uuid, user?.id, user?.raw?.uuid].filter(Boolean).map(String);
  const extension = String(user?.raw?.extension?.username || '');
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeUserStatus);
  return normalized.find((row) => candidates.includes(row.uuid))
    || normalized.find((row) => extension && row.extension === extension)
    || (normalized.length === 1 ? normalized[0] : null);
}

export function formatStatusTime(value, locale) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  const date = new Date(Number.isFinite(numeric) ? numeric * 1000 : value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(locale);
}
