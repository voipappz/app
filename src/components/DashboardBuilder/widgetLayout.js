// Grid placement for the widget board: the store keeps `{ x, y, col, row }`
// per widget (dashboardWidgetsApi.updateWidgetLayout); react-grid-layout
// speaks `{ i, x, y, w, h }`. Both boards (dashboard and Live) share this.
export const GRID_COLS = 4;
export const ROW_HEIGHT = 120;

const WIDE_TYPES = new Set(['trend', 'line', 'bar', 'pie', 'table']);

export function defaultSize(type) {
  if (type === 'explorer') return { w: GRID_COLS, h: 3 };
  if (WIDE_TYPES.has(type)) return { w: 2, h: 2 };
  return { w: 1, h: 2 };
}

const saved = (widget) => {
  const l = widget.layout;
  if (!l || [l.x, l.y, l.col, l.row].some((v) => !Number.isFinite(Number(v)))) return null;
  return { x: Number(l.x), y: Number(l.y), w: Number(l.col), h: Number(l.row) };
};

// Saved placements as they are; the rest flow after them in position order,
// left to right, wrapping when a widget would not fit the row.
export function layoutFor(widgets) {
  const ordered = [...widgets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const placed = ordered.filter(saved).map((widget) => ({ i: widget.uuid, ...saved(widget) }));
  let cursorX = 0;
  let cursorY = placed.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
  let rowH = 0;
  const flowed = ordered.filter((widget) => !saved(widget)).map((widget) => {
    const { w, h } = defaultSize(widget.type);
    if (cursorX + w > GRID_COLS) { cursorX = 0; cursorY += rowH; rowH = 0; }
    const item = { i: widget.uuid, x: cursorX, y: cursorY, w, h };
    cursorX += w;
    rowH = Math.max(rowH, h);
    return item;
  });
  return [...placed, ...flowed];
}

export function layoutChanges(widgets, layout) {
  return layout.flatMap((item) => {
    const widget = widgets.find((entry) => entry.uuid === item.i);
    if (!widget) return [];
    const before = saved(widget);
    if (before && before.x === item.x && before.y === item.y && before.w === item.w && before.h === item.h) return [];
    return [{ uuid: widget.uuid, layout: { x: item.x, y: item.y, col: item.w, row: item.h } }];
  });
}
