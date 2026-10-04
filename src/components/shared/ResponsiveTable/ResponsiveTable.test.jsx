import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../../../theme/theme';
import ResponsiveTable from './ResponsiveTable';
import { byPriority, cardColumns, cellValue, muiAlign } from './columns';

// useMediaQuery's callback form reads the theme from context (MUI v7 passes
// null without a provider), and jsdom has no matchMedia. Both are stubbed the
// way the real app supplies them.
const theme = createAppTheme('ltr');

const setViewport = (width) => {
  window.matchMedia = vi.fn().mockImplementation((query) => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const matches = (!max || width <= parseFloat(max[1])) && (!min || width >= parseFloat(min[1]));
    return {
      matches, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    };
  });
};

const columns = [
  { id: 'ext', label: 'Extension', priority: 'primary' },
  { id: 'name', label: 'Name', priority: 'secondary' },
  { id: 'env', label: 'Application', priority: 'meta' },
  { id: 'registered', label: 'Registered', priority: 'meta', align: 'end',
    render: (r) => (r.registered ? 'yes' : 'no') },
  { id: 'internal', label: 'Internal', priority: 'desktopOnly' },
  { id: 'actions', label: '', priority: 'action',
    render: (r) => <button onClick={() => r.onAct?.()}>act</button> },
];

const rows = [
  { uuid: 'a', ext: '101', name: 'Reception', env: 'Acme', registered: true, internal: 'x' },
  { uuid: 'b', ext: '102', name: 'Sales', env: 'Acme', registered: false, internal: 'y' },
];

const renderTable = (props) => render(
  <ThemeProvider theme={theme}>
    <ResponsiveTable columns={columns} rows={rows} getRowId={(r) => r.uuid} {...props} />
  </ThemeProvider>
);

describe('ResponsiveTable — desktop', () => {
  beforeEach(() => { vi.restoreAllMocks(); setViewport(1280); });

  it('renders a real table with one header per column', () => {
    renderTable();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Extension' })).toBeInTheDocument();
    // desktopOnly columns DO appear here — that is what the flag means.
    expect(screen.getByRole('columnheader', { name: 'Internal' })).toBeInTheDocument();
  });

  it('renders a row per record, using render when given', () => {
    renderTable();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('Reception')).toBeInTheDocument();
    expect(screen.getByText('yes')).toBeInTheDocument(); // from render()
    expect(screen.getByText('no')).toBeInTheDocument();
  });

  it('forwards data-testid, so existing selectors keep working', () => {
    renderTable({ 'data-testid': 'extensions-table' });
    expect(screen.getByTestId('extensions-table')).toBeInTheDocument();
  });

  it('calls onRowClick with the row', () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    fireEvent.click(screen.getByText('Reception'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('does not fire the row click from an action cell', () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    fireEvent.click(screen.getAllByText('act')[0]);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders the sort affordance only for sortable columns, and reports it', () => {
    const onSort = vi.fn();
    const sortable = columns.map((c) => (c.id === 'ext' ? { ...c, sortable: true } : c));
    render(
      <ThemeProvider theme={theme}>
        <ResponsiveTable columns={sortable} rows={rows} getRowId={(r) => r.uuid}
          sortBy="ext" sortDirection="desc" onSort={onSort} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Extension/ }));
    expect(onSort).toHaveBeenCalledWith('ext');
  });

  it('shows the pager only when paging props are supplied', () => {
    renderTable();
    expect(screen.queryByText(/Rows per page/i)).not.toBeInTheDocument();

    renderTable({ count: 50, page: 0, rowsPerPage: 25, onPageChange: vi.fn(), onRowsPerPageChange: vi.fn() });
    expect(screen.getByText(/Rows per page/i)).toBeInTheDocument();
  });

  it('shows the empty message in the table body, spanning the columns', () => {
    renderTable({ rows: [], emptyMessage: 'No extensions yet' });
    expect(screen.getByText('No extensions yet')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument(); // headers still there
  });

  it('shows a spinner while loading with nothing yet', () => {
    renderTable({ rows: [], loading: true });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});

describe('ResponsiveTable — phone', () => {
  beforeEach(() => { vi.restoreAllMocks(); setViewport(375); });

  it('renders cards instead of a table', () => {
    renderTable();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByTestId('responsive-table-cards')).toBeInTheDocument();
  });

  it('keeps primary, secondary and meta but drops desktopOnly', () => {
    renderTable();
    expect(screen.getByText('101')).toBeInTheDocument();       // primary
    expect(screen.getByText('Reception')).toBeInTheDocument(); // secondary
    expect(screen.getAllByText('Application:').length).toBe(2); // meta carries its label
    // The whole point of the flag: this column is not on a phone.
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('still renders action columns', () => {
    renderTable();
    expect(screen.getAllByText('act').length).toBe(2);
  });

  it('opens a card on click', () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    fireEvent.click(screen.getByText('101'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('lets a screen supply its own card', () => {
    // Calls has a bespoke card (country flag, direction, play button) and keeps it.
    renderTable({ renderCard: (r) => <div data-testid="custom">{r.ext}!</div> });
    expect(screen.getAllByTestId('custom').length).toBe(2);
  });

  it('shows the empty message', () => {
    renderTable({ rows: [], emptyMessage: 'Nothing here' });
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('falls back to the pager when the screen cannot cursor-page', () => {
    // Most of the 29 screens page by offset; without onLoadMore there is no
    // sentinel, so the phone still needs a way to reach page two.
    renderTable({ count: 50, page: 0, rowsPerPage: 25, onPageChange: vi.fn(), onRowsPerPageChange: vi.fn() });
    expect(screen.getByText(/Rows per page/i)).toBeInTheDocument();
  });
});

describe('column helpers', () => {
  it('groups by priority, defaulting to meta', () => {
    expect(byPriority(columns, 'primary').map((c) => c.id)).toEqual(['ext']);
    expect(byPriority([{ id: 'x' }], 'meta').map((c) => c.id)).toEqual(['x']);
  });

  it('drops desktopOnly from the card set', () => {
    expect(cardColumns(columns).map((c) => c.id)).not.toContain('internal');
  });

  it('reads a value from render, else from the row by id', () => {
    expect(cellValue({ id: 'ext' }, rows[0])).toBe('101');
    expect(cellValue({ id: 'x', render: () => 'computed' }, rows[0])).toBe('computed');
  });

  it('translates logical alignment for MUI, which still wants physical', () => {
    expect(muiAlign('start')).toBe('left');
    expect(muiAlign('end')).toBe('right');
    expect(muiAlign('center')).toBe('center');
    expect(muiAlign(undefined)).toBe('left');
  });

  it('rejects a malformed column list loudly', () => {
    // A typo in `priority` would otherwise silently drop the column from every
    // phone card — the kind of bug nobody notices until a customer reports it.
    expect(() => renderTable({ columns: [{ id: 'a', priority: 'primry' }] })).toThrow(/priority/);
    expect(() => renderTable({ columns: [{ label: 'no id' }] })).toThrow(/id/);
    expect(() => renderTable({ columns: [{ id: 'dup' }, { id: 'dup' }] })).toThrow(/duplicate/);
  });
});
