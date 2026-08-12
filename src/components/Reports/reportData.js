const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function humanizeColumn(value) {
  return String(value || 'Column')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value) {
  if (isObject(value) && Object.hasOwn(value, 'data')) return displayValue(value.data);
  if (value === null || value === undefined) return '';
  if (isObject(value) || Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function uniqueLabel(label, labels) {
  let candidate = label;
  let suffix = 2;
  while (labels.has(candidate)) {
    candidate = `${label} ${suffix}`;
    suffix += 1;
  }
  labels.add(candidate);
  return candidate;
}

function fieldDefinitions(payload, rawRows) {
  const rawFields = payload?.table?.fields ?? payload?.fields ?? payload?.columns;
  const fields = Array.isArray(rawFields) ? rawFields : [];
  const derived = fields.length > 0
    ? fields
    : Object.keys(isObject(rawRows[0]) ? rawRows[0] : {});
  const labels = new Set();

  return derived.map((field, index) => {
    const source = isObject(field) ? field : {};
    const key = String(source.field ?? source.key ?? source.id ?? field ?? `column_${index + 1}`);
    const label = uniqueLabel(String(source.name ?? source.label ?? humanizeColumn(key)), labels);
    return { key, label };
  });
}

/**
 * Collapse the report engine's table/direct/dashboard result variants into the
 * small shape consumed by ReportChart. Nested cells such as {data, color} are
 * intentionally flattened to their display value.
 */
export function normalizeReportResult(payload, report = {}) {
  const rawRows = payload?.table?.data ?? payload?.data ?? payload?.rows;
  const sourceRows = Array.isArray(rawRows) ? rawRows : [];
  const fields = fieldDefinitions(payload, sourceRows);
  const columns = fields.map((field) => field.label);
  const rows = sourceRows.map((sourceRow) => {
    const row = {};
    fields.forEach((field, index) => {
      const value = Array.isArray(sourceRow) ? sourceRow[index] : sourceRow?.[field.key];
      row[field.label] = displayValue(value);
    });
    return row;
  });

  return {
    name: report.name ?? payload?.name ?? '',
    columns,
    rows,
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function reportToCsv({ columns = [], rows = [] } = {}) {
  if (!columns.length) return '';
  return [
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row?.[column])).join(',')),
  ].join('\r\n');
}
