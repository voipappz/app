import { describe, expect, it } from 'vitest';
import { GRID_COLS, defaultSize, layoutFor, layoutChanges } from './widgetLayout';

const w = (uuid, type, extra = {}) => ({ uuid, type, position: 0, ...extra });

describe('widget layout', () => {
  it('sizes by type: tiles narrow, charts and tables wide, the explorer full width', () => {
    expect(defaultSize('counter')).toEqual({ w: 1, h: 2 });
    expect(defaultSize('line')).toEqual({ w: 2, h: 2 });
    expect(defaultSize('table')).toEqual({ w: 2, h: 2 });
    expect(defaultSize('explorer')).toEqual({ w: GRID_COLS, h: 3 });
  });

  it('flows unplaced widgets left to right in position order and wraps at the last column', () => {
    const layout = layoutFor([
      w('c', 'counter', { position: 2 }),
      w('a', 'line', { position: 0 }),
      w('b', 'line', { position: 1 }),
    ]);
    expect(layout).toEqual([
      { i: 'a', x: 0, y: 0, w: 2, h: 2 },
      { i: 'b', x: 2, y: 0, w: 2, h: 2 },
      { i: 'c', x: 0, y: 2, w: 1, h: 2 },
    ]);
  });

  it('keeps a saved placement over the default one', () => {
    const [item] = layoutFor([w('a', 'counter', { layout: { x: 3, y: 4, col: 1, row: 3 } })]);
    expect(item).toEqual({ i: 'a', x: 3, y: 4, w: 1, h: 3 });
  });

  it('reports only the widgets whose placement changed, in the store’s shape', () => {
    const widgets = [
      w('a', 'counter', { layout: { x: 0, y: 0, col: 1, row: 2 } }),
      w('b', 'counter', { layout: { x: 1, y: 0, col: 1, row: 2 } }),
    ];
    const next = [
      { i: 'a', x: 0, y: 0, w: 1, h: 2 },
      { i: 'b', x: 2, y: 1, w: 2, h: 2 },
    ];
    expect(layoutChanges(widgets, next)).toEqual([{ uuid: 'b', layout: { x: 2, y: 1, col: 2, row: 2 } }]);
  });
});
