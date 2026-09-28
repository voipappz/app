import { describe, it, expect, beforeEach } from 'vitest';
import {
  setDashboardStorageScope, getWidgets, createWidget, moveWidget, updateWidgetLayout, sectionOf, seedWidgets,
} from './dashboardWidgetsApi';

/**
 * Order and position live in localStorage with the rest of the definition —
 * there is no server for them, and the board must come back the way it was
 * left.
 */

const titles = async () => (await getWidgets('board')).map((w) => w.title);

describe('dashboardWidgetsApi — order and position', () => {
  beforeEach(() => {
    localStorage.clear();
    setDashboardStorageScope('spec');
  });

  it('shows widgets in the order they were added, and keeps it across reloads', async () => {
    await createWidget({ title: 'A', type: 'counter' }, 'board');
    await createWidget({ title: 'B', type: 'counter' }, 'board');
    await createWidget({ title: 'C', type: 'counter' }, 'board');

    expect(await titles()).toEqual(['A', 'B', 'C']);
    // What is stored is the order, not the array: a re-read is the same board.
    expect((await getWidgets('board')).map((w) => w.position)).toEqual([0, 1, 2]);
  });

  it('moves a widget among its neighbours and remembers it', async () => {
    await createWidget({ title: 'A', type: 'counter' }, 'board');
    const b = await createWidget({ title: 'B', type: 'counter' }, 'board');
    await createWidget({ title: 'C', type: 'counter' }, 'board');

    await moveWidget(b.uuid, -1, 'board');
    expect(await titles()).toEqual(['B', 'A', 'C']);

    await moveWidget(b.uuid, +1, 'board');
    await moveWidget(b.uuid, +1, 'board');
    expect(await titles()).toEqual(['A', 'C', 'B']);
  });

  it('stays put at the ends of the board', async () => {
    const a = await createWidget({ title: 'A', type: 'counter' }, 'board');
    await createWidget({ title: 'B', type: 'counter' }, 'board');

    await moveWidget(a.uuid, -1, 'board');
    expect(await titles()).toEqual(['A', 'B']);
  });

  it('moves within a section only — a tile never trades places with a chart', async () => {
    await createWidget({ title: 'tile 1', type: 'counter' }, 'board');
    await createWidget({ title: 'chart', type: 'trend' }, 'board');
    const t2 = await createWidget({ title: 'tile 2', type: 'stat' }, 'board');

    await moveWidget(t2.uuid, -1, 'board');
    // tile 2 skipped over the chart to land before tile 1.
    expect(await titles()).toEqual(['tile 2', 'chart', 'tile 1']);
  });

  it('numbers a board stored before order existed, in the order it was shown', async () => {
    localStorage.setItem('dashboard-definitions:spec', JSON.stringify({
      dashboards: [{ uuid: 'default', name: 'Default' }, { uuid: 'board', name: 'Board' }],
      widgets: { default: [], board: [{ uuid: 'w1', title: 'A', type: 'counter' }, { uuid: 'w2', title: 'B', type: 'counter' }] },
    }));

    expect(await titles()).toEqual(['A', 'B']);
    await moveWidget('w2', -1, 'board');
    expect(await titles()).toEqual(['B', 'A']);
  });

  it('keeps the grid placement, in the old server contract\'s names', async () => {
    const a = await createWidget({ title: 'A', type: 'counter' }, 'board');

    await updateWidgetLayout(a.uuid, { x: 2, y: 1, w: 3, h: 2 }, 'board');
    expect((await getWidgets('board'))[0].layout).toEqual({ x: 2, y: 1, col: 3, row: 2 });

    // A partial update touches only what it names.
    await updateWidgetLayout(a.uuid, { x: 0 }, 'board');
    expect((await getWidgets('board'))[0].layout).toEqual({ x: 0, y: 1, col: 3, row: 2 });
  });

  it('answers null for a widget the board does not have', async () => {
    expect(await updateWidgetLayout('nope', { x: 1 }, 'board')).toBeNull();
  });

  it('places every type in one section', () => {
    expect(sectionOf('counter')).toBe('tiles');
    expect(sectionOf('pie')).toBe('charts');
    expect(sectionOf('table')).toBe('tables');
  });
});

describe('dashboardWidgetsApi — seeding a board once', () => {
  beforeEach(() => {
    localStorage.clear();
    setDashboardStorageScope('seed-spec');
  });

  it('puts the seeded widgets on top and moves the existing ones below them', async () => {
    const mine = await createWidget({ title: 'Mine', type: 'counter' }, 'board');
    await updateWidgetLayout(mine.uuid, { x: 0, y: 0, col: 1, row: 2 }, 'board');

    const seeded = await seedWidgets('v1', [
      { title: 'Top', type: 'calls_stat', layout: { x: 0, y: 0, col: 4, row: 3 } },
    ], 'board');

    expect(seeded).toBe(true);
    const board = await getWidgets('board');
    expect(board.map((w) => w.title)).toEqual(['Top', 'Mine']);
    expect(board[1].layout).toMatchObject({ y: 3 });
  });

  it('seeds once per key, so a removed widget does not come back', async () => {
    await seedWidgets('v1', [{ title: 'Top', type: 'calls_stat', layout: { x: 0, y: 0, col: 1, row: 1 } }], 'board');
    const [top] = await getWidgets('board');
    const { deleteWidget } = await import('./dashboardWidgetsApi');
    await deleteWidget(top.uuid);

    expect(await seedWidgets('v1', [{ title: 'Top', type: 'calls_stat' }], 'board')).toBe(false);
    expect(await titles()).toEqual([]);
  });
});
