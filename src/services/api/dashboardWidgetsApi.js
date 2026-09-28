/**
 * dashboardWidgetsApi — CRUD for the LOCAL dashboard widget definitions.
 *
 * Same contract as `app`'s services/dashboardsApi.js (ported UI/hooks call
 * these functions unchanged), but backed by localStorage instead of a
 * Postgres-backed `/dashboard/widgets` REST API — that API belonged to
 * app's own Elixir portal, not voipappz-api, and nothing equivalent exists
 * (or is being added) here. A definition only ever says what to show;
 * widget VALUES always come from the live Influx-backed snapshot
 * (useDashboardSnapshot), never from here.
 *
 * Counter metrics are the DashboardSnapshot.stats keys.
 */
export const COUNTER_METRICS = ['total', 'answered', 'failed', 'avg_duration_sec'];

import { WIDGET_TEMPLATES, applyTemplate } from '../../components/DashboardBuilder/widgetTemplates';

const STORAGE_PREFIX = 'dashboard-definitions';
let currentScope = 'global';

/**
 * Scope storage to a tenant so boards don't bleed across environments —
 * the admin's selected environment uuid, or a portal user's own
 * environment_uuid. Call this once scope is known (mirrors config.js's
 * setDynamicApiBaseUrl pattern); defaults to a single 'global' bucket
 * until then.
 */
export function setDashboardStorageScope(scope) {
  currentScope = scope || 'global';
}

const storageKey = () => `${STORAGE_PREFIX}:${currentScope}`;

// A first-run board, not an empty one.
//
// The screen used to open with three built-in tiles and nothing else, and the
// only way to see a statistic was to know to click "Add widget" and then pick
// a measurement and an aggregation. That is a builder's task on what is
// supposed to be an end user's landing page. These five are the questions an
// agent actually opens the portal to answer, already wired to measurements
// this platform writes.
//
// Seeded only when no board has ever been stored for this scope. Deleting a
// widget sticks: the store is written on first read, so an empty board stays
// empty rather than resurrecting itself on the next load.
const STARTER_WIDGET_KEYS = ['callsToday', 'callsInProgress', 'avgCallDuration', 'extensionsTotal', 'recentCalls'];

function starterWidgets() {
  try {
    return STARTER_WIDGET_KEYS
      .filter((key) => WIDGET_TEMPLATES[key])
      .map((key) => ({ ...applyTemplate(key), uuid: uuid(), dashboard_uuid: 'default' }));
  } catch {
    // A broken template must not cost the user their dashboard.
    return [];
  }
}

const emptyStore = () => ({
  dashboards: [{ uuid: 'default', name: 'Default' }],
  widgets: { default: starterWidgets() }
});

function readStore() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      // Persist the seed immediately. Without this the starter board is
      // recreated on every load and deleting a widget appears to do nothing.
      const seeded = emptyStore();
      writeStore(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.dashboards) || typeof parsed.widgets !== 'object') return emptyStore();
    // Always guarantee a 'default' dashboard exists, same as app's dashboardId fallback.
    if (!parsed.dashboards.some((d) => d.uuid === 'default')) {
      parsed.dashboards.unshift({ uuid: 'default', name: 'Default' });
    }
    if (!parsed.widgets.default) parsed.widgets.default = [];
    // A board stored before order existed keeps the order it was shown in.
    for (const list of Object.values(parsed.widgets)) numberPositions(list);
    return parsed;
  } catch {
    return emptyStore();
  }
}

// ---- Order and position ----------------------------------------------------
//
// `position` is the widget's place on its board, and it is the ONLY thing the
// board's order is read from — never insertion order, which is what a fresh
// duplicate would otherwise scramble. `layout` ({ x, y, col, row }) is the
// grid placement, in the names the old server-side dashboard used
// (`PATCH /api/dashboards/:id/widgets/:id`), kept here so a board can carry
// it without a server. Both live in localStorage with the rest of the
// definition.

/** Give every widget a position, by its current order, where it has none. */
function numberPositions(list) {
  list
    .slice()
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    .forEach((w, i) => { w.position = i; });
}

function byPosition(list) {
  return list.slice().sort((a, b) => a.position - b.position);
}

/**
 * The section of the board a widget type renders in. Moving a widget moves it
 * among its neighbours in the same section: a tile never trades places with a
 * chart, because they are never side by side on screen.
 */
export function sectionOf(type) {
  if (['counter', 'gauge', 'stat', 'calls_stat', 'live_calls'].includes(type)) return 'tiles';
  if (['trend', 'line', 'bar', 'pie', 'calls_chart', 'calls_outcome', 'query'].includes(type)) return 'charts';
  if (type === 'table') return 'tables';
  return 'other';
}

function writeStore(store) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(store));
  } catch {
    // storage disabled/full — mutations silently no-op past this point,
    // matching the "storage disabled" tolerance already used elsewhere here.
  }
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `w-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function getDashboards() {
  return readStore().dashboards;
}

export async function createDashboard(name) {
  const store = readStore();
  const created = { uuid: uuid(), name };
  store.dashboards.push(created);
  store.widgets[created.uuid] = [];
  writeStore(store);
  return created;
}

export async function renameDashboard(dashboardUuid, name) {
  const store = readStore();
  const dashboard = store.dashboards.find((d) => d.uuid === dashboardUuid);
  if (dashboard) dashboard.name = name;
  writeStore(store);
  return dashboard || null;
}

export async function deleteDashboard(dashboardUuid) {
  if (dashboardUuid === 'default') return null; // the default board is never removable
  const store = readStore();
  store.dashboards = store.dashboards.filter((d) => d.uuid !== dashboardUuid);
  delete store.widgets[dashboardUuid];
  writeStore(store);
  return true;
}

/** A board's widgets, in the order they are shown. */
export async function getWidgets(dashboardUuid = 'default') {
  return byPosition(readStore().widgets[dashboardUuid] || []);
}

/**
 * Put a set of widgets at the top of a board ONCE per `seedKey`: each item is
 * a definition with its `layout` ({ x, y, col, row }). Widgets already on the
 * board move down below them, keeping their order and placement. Deleting a
 * seeded widget sticks, because the key is remembered on the store.
 * Returns true when it seeded.
 */
export async function seedWidgets(seedKey, items, dashboardUuid = 'default') {
  const store = readStore();
  store.seeded = Array.isArray(store.seeded) ? store.seeded : [];
  if (store.seeded.includes(seedKey)) return false;
  if (!store.widgets[dashboardUuid]) store.widgets[dashboardUuid] = [];
  const list = store.widgets[dashboardUuid];
  const height = items.reduce((bottom, item) => Math.max(bottom, (item.layout?.y ?? 0) + (item.layout?.row ?? 0)), 0);
  for (const widget of list) {
    if (widget.layout && Number.isFinite(Number(widget.layout.y))) widget.layout = { ...widget.layout, y: Number(widget.layout.y) + height };
    widget.position = (widget.position ?? 0) + items.length;
  }
  items.forEach((item, index) => {
    list.push({ ...item, uuid: uuid(), dashboard_uuid: dashboardUuid, position: index });
  });
  numberPositions(list);
  store.seeded.push(seedKey);
  writeStore(store);
  return true;
}

/** Appends: a new widget goes last on its board. */
export async function createWidget(widget, dashboardUuid = 'default') {
  const store = readStore();
  if (!store.widgets[dashboardUuid]) store.widgets[dashboardUuid] = [];
  const list = store.widgets[dashboardUuid];
  const created = { ...widget, uuid: uuid(), dashboard_uuid: dashboardUuid, position: list.length };
  list.push(created);
  numberPositions(list);
  writeStore(store);
  return created;
}

/**
 * Move a widget one step among the widgets of its own section (`delta` -1 or
 * +1). At either end it stays put. Returns the board in its new order.
 */
export async function moveWidget(widgetUuid, delta, dashboardUuid = 'default') {
  const store = readStore();
  const list = store.widgets[dashboardUuid] || [];
  const ordered = byPosition(list);
  const from = ordered.findIndex((w) => w.uuid === widgetUuid);
  if (from === -1) return ordered;
  const section = sectionOf(ordered[from].type);
  const step = delta < 0 ? -1 : 1;
  let to = from + step;
  while (to >= 0 && to < ordered.length && sectionOf(ordered[to].type) !== section) to += step;
  if (to < 0 || to >= ordered.length) return ordered;
  [ordered[from].position, ordered[to].position] = [ordered[to].position, ordered[from].position];
  writeStore(store);
  return byPosition(list);
}

/**
 * Grid placement, kept as `{ x, y, col, row }`. `w`/`h` are accepted as
 * `col`/`row`, the way the old server contract took them.
 */
export async function updateWidgetLayout(widgetUuid, layout = {}, dashboardUuid = 'default') {
  const store = readStore();
  const widget = (store.widgets[dashboardUuid] || []).find((w) => w.uuid === widgetUuid);
  if (!widget) return null;
  widget.layout = {
    ...(widget.layout || {}),
    ...(layout.x !== undefined && { x: layout.x }),
    ...(layout.y !== undefined && { y: layout.y }),
    ...((layout.col ?? layout.w) !== undefined && { col: layout.col ?? layout.w }),
    ...((layout.row ?? layout.h) !== undefined && { row: layout.row ?? layout.h }),
  };
  writeStore(store);
  return widget;
}

export async function updateWidget(widgetUuid, patch, dashboardUuid = 'default') {
  const store = readStore();
  const list = store.widgets[dashboardUuid] || [];
  const index = list.findIndex((w) => w.uuid === widgetUuid);
  if (index === -1) return null;
  list[index] = { ...list[index], ...patch };
  writeStore(store);
  return list[index];
}

export async function deleteWidget(widgetUuid) {
  const store = readStore();
  for (const dashboardUuid of Object.keys(store.widgets)) {
    store.widgets[dashboardUuid] = store.widgets[dashboardUuid].filter((w) => w.uuid !== widgetUuid);
  }
  writeStore(store);
  return true;
}
