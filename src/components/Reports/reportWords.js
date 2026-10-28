// The words a report's display type is shown with (reports.json). The types
// come from the server (Report::TYPES); a type the app knows gets its own
// name, any other is tidied up as before ("line_2" → "Line 2").

const tidy = (value) => String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const CHART_KINDS = new Set(['table', 'line', 'bar', 'pie', 'scatter', 'map']);

/** A display type as a choice in the report form: "Table", "Line"… */
export const displayTypeName = (t, type) => t(`display.${type}`, { defaultValue: tidy(type) });

/** What a report is drawn as, for its chip: "Table", "Line chart"… */
export const chartKindName = (t, type) => (CHART_KINDS.has(type)
  ? t(`chartKind.${type}`)
  : t('chartKind.other', { type: tidy(type) }));
