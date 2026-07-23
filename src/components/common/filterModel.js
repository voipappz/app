// filterModel — pure, framework-agnostic filtering, ported from the
// va-voipbox-portal `report-filters` model (types: string, numeric, select,
// multiselect, time, boolean). Kept side-effect-free so it's unit-testable and
// reused by both Calls (client-side) and Reports.

export const FILTER_TYPES = ['string', 'numeric', 'select', 'multiselect', 'time', 'boolean'];

export const STRING_OPS = ['contains', 'equals', 'starts'];
export const NUMERIC_OPS = ['=', '>', '<', '>=', '<='];

// A fresh active-filter object for a given field definition.
export function newFilter(field) {
  switch (field.type) {
    case 'string': return { name: field.name, type: 'string', op: 'contains', value: '' };
    case 'numeric': return { name: field.name, type: 'numeric', op: '=', value: '' };
    case 'multiselect': return { name: field.name, type: 'multiselect', value: [] };
    case 'time': return { name: field.name, type: 'time', value: { from: '', to: '' } };
    case 'boolean': return { name: field.name, type: 'boolean', value: true };
    default: return { name: field.name, type: 'select', value: '' };
  }
}

// Is this filter "empty" (→ ignored, so a half-built filter doesn't hide everything)?
export function isEmpty(f) {
  if (f.type === 'time') return !f.value?.from && !f.value?.to;
  if (f.type === 'multiselect') return !Array.isArray(f.value) || f.value.length === 0;
  if (f.type === 'boolean') return false; // a boolean always constrains
  return f.value === '' || f.value == null;
}

function matchOne(row, f) {
  const raw = row[f.name];
  switch (f.type) {
    case 'string': {
      const a = String(raw ?? '').toLowerCase();
      const b = String(f.value).toLowerCase();
      if (f.op === 'equals') return a === b;
      if (f.op === 'starts') return a.startsWith(b);
      return a.includes(b);
    }
    case 'numeric': {
      const a = Number(raw), b = Number(f.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      switch (f.op) {
        case '>': return a > b;
        case '<': return a < b;
        case '>=': return a >= b;
        case '<=': return a <= b;
        default: return a === b;
      }
    }
    case 'select': return String(raw ?? '') === String(f.value);
    case 'multiselect': return f.value.map(String).includes(String(raw ?? ''));
    case 'boolean': return Boolean(raw) === Boolean(f.value);
    case 'time': {
      const ms = new Date(String(raw ?? '').replace(' ', 'T')).getTime();
      if (Number.isNaN(ms)) return false;
      if (f.value.from && ms < new Date(f.value.from).getTime()) return false;
      if (f.value.to && ms > new Date(f.value.to).getTime()) return false;
      return true;
    }
    default: return true;
  }
}

// Apply active filters (AND across filters). Empty filters are skipped.
export function applyFilters(rows, filters) {
  const active = (filters || []).filter((f) => !isEmpty(f));
  if (!active.length) return rows;
  return rows.filter((row) => active.every((f) => matchOne(row, f)));
}
