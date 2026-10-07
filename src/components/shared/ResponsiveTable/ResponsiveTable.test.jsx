import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ResponsiveTable from './ResponsiveTable';
import { pretendPhoneScreen } from '../../../test/phoneScreen';

const columns = [
  { id: 'name', label: 'Name', sortable: true, priority: 'primary' },
  { id: 'extension', label: 'Extension', priority: 'secondary' },
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
