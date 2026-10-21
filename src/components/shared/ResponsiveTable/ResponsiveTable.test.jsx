import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ResponsiveTable from './ResponsiveTable';
import { DENSITY } from './density';
import { pretendPhoneScreen } from '../../../test/phoneScreen';
import { pretendScreenWidth } from '../../../test/screenWidth';
import { styledCss } from '../../../test/styledCss';

const columns = [
  { id: 'name', label: 'Name', sortable: true, priority: 'primary' },
  { id: 'extension', label: 'Extension', priority: 'secondary', width: 90 },
  { id: 'status', label: 'Status', priority: 'meta' },
  { id: 'created', label: 'Created', priority: 'desktopOnly' },
  { id: 'actions', label: 'Actions', align: 'center', priority: 'action', render: (row) => <button type="button">Edit {row.name}</button> },
];
const rows = [
  { uuid: 'a', name: 'Alice', extension: '101', status: 'Online', created: '2026-01-01' },
  { uuid: 'b', name: 'Bob', extension: '102', status: 'Offline', created: '2026-01-02' },
];
const table = (props = {}) => (
  <ResponsiveTable columns={columns} rows={rows} getRowId={(row) => row.uuid} emptyMessage="Nothing here" {...props} />
);

let backToDesktop = () => {};
afterEach(() => backToDesktop());

describe('ResponsiveTable on a desktop', () => {
  it('renders every column as a table', () => {
    render(table());
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
  });

  it('sorts by a sortable column and opens a row', () => {
    const onSort = vi.fn();
    const onRowClick = vi.fn();
    render(table({ onSort, onRowClick, sortBy: 'name' }));
    fireEvent.click(screen.getByText('Name'));
    fireEvent.click(screen.getByText('Bob'));
    expect(onSort).toHaveBeenCalledWith('name');
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('shows the empty message, or placeholder rows while the first page loads', () => {
    const { rerender } = render(table({ rows: [] }));
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    rerender(table({ rows: [], loading: true, skeletonRows: 3 }));
    expect(screen.queryByText('Nothing here')).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 placeholders
  });
});

describe('ResponsiveTable density', () => {
  it('is a small, dense table by default: tight cells, 40px rows, auto layout over the full width', () => {
    render(table());
    expect(screen.getByRole('columnheader', { name: 'Status' })).toHaveClass('MuiTableCell-sizeSmall');
    const css = styledCss();
    expect(css).toContain(`padding:${DENSITY.cellPadding}`);
    expect(css).toContain(`height:${DENSITY.rowHeight}px`);
    expect(css).toContain('table-layout:auto');
    expect(css).toContain('white-space:nowrap');
  });

  it('keeps a column\'s fixed width on its header', () => {
    render(table());
    expect(styledCss()).toContain('width:90px');
  });

  it('lets a caller opt out with dense={false}', () => {
    render(table({ dense: false }));
    expect(screen.getByRole('columnheader', { name: 'Status' })).toHaveClass('MuiTableCell-sizeMedium');
  });
});

describe('ResponsiveTable on a phone', () => {
  it('shows one card per row, without desktop-only columns', () => {
    backToDesktop = pretendPhoneScreen();
    render(table());
    const cards = screen.getAllByTestId('mobile-record-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Alice')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Online')).toBeInTheDocument();
    expect(within(cards[0]).getByRole('button', { name: 'Edit Alice' })).toBeInTheDocument();
    expect(screen.queryByText('2026-01-01')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('ResponsiveTable between a phone and a desktop', () => {
  const withHidden = [
    ...columns.slice(0, 2),
    { ...columns[2], hideBelow: 'lg' },
    { ...columns[3], hideBelow: 'xl' },
    columns[4],
  ];
  const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent);

  it('drops a column below its hideBelow breakpoint and keeps it above', () => {
    backToDesktop = pretendScreenWidth(1024);
    const { unmount } = render(table({ columns: withHidden }));
    expect(headers()).toEqual(['Name', 'Extension', 'Actions']);
    unmount();

    backToDesktop = pretendScreenWidth(1440);
    const second = render(table({ columns: withHidden }));
    expect(headers()).toEqual(['Name', 'Extension', 'Status', 'Actions']);
    second.unmount();

    backToDesktop = pretendScreenWidth(1600);
    render(table({ columns: withHidden }));
    expect(headers()).toHaveLength(5);
  });

  it('still shows a hidden column on the cards', () => {
    backToDesktop = pretendScreenWidth(768);
    render(table({ columns: withHidden }));
    expect(within(screen.getAllByTestId('mobile-record-card')[0]).getByText('Online')).toBeInTheDocument();
  });

  it('puts two cards in a row from a tablet up, one on a phone', () => {
    backToDesktop = pretendScreenWidth(768);
    render(table());
    const css = styledCss();
    expect(css).toMatch(/grid-template-columns:minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/grid-template-columns:repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });
});
