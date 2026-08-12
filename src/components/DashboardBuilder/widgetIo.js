/**
 * Dashboard export / import — a portable JSON document of widget DEFINITIONS.
 *
 * Ported from nimbus's `exportDashboard`/`importDashboard`, minus its layouts,
 * time range and refresh interval (this dashboard has no react-grid-layout and
 * polls on a fixed interval). Server-owned identity (`uuid`, `position`) is
 * stripped on export so an import always creates fresh widgets — re-importing
 * into the same install duplicates rather than silently overwriting.
 */
import { withDefaults } from './widgetTemplates';

export const EXPORT_VERSION = 1;

const PORTABLE_KEYS = [
  'title', 'type', 'metric', 'fields', 'icon', 'color', 'unit',
  'thresholds', 'inverse', 'min', 'max',
  'eventType', 'action',
];

/** Widget → the portable subset (drops uuid/position and unknown extras). */
export function toPortable(widget) {
  const full = withDefaults(widget);
  return Object.fromEntries(PORTABLE_KEYS.map((key) => [key, full[key]]));
}

/** widgets → the export document. */
export function exportWidgets(widgets) {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    widgets: (Array.isArray(widgets) ? widgets : []).map(toPortable),
  };
}

/**
 * Export document (object or JSON text) → widget drafts ready for createWidget.
 * Throws a plain Error on anything unusable so the caller can surface it.
 */
export function parseImportedWidgets(input) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const list = Array.isArray(doc) ? doc : doc?.widgets;
  if (!Array.isArray(list)) throw new Error('no widgets in file');
  const widgets = list
    .filter((w) => w && typeof w === 'object' && !Array.isArray(w))
    .map(toPortable);
  if (!widgets.length) throw new Error('no widgets in file');
  return widgets;
}

/** Export document → a downloadable JSON blob + filename. */
export function exportFilename(now = new Date()) {
  return `dashboard-${now.toISOString().slice(0, 10)}.json`;
}
