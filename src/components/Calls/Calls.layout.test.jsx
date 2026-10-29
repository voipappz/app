import { render, screen, within, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Calls screen rendered for real; the data hook, handlers and heavy panels
// are stubbed so what is under test is the layout and the counters.
const hookState = { aggregate: { cause: [], direction: [] }, durationAggregate: null, failed: false, segments: [], params: {} };
const mocks = vi.hoisted(() => ({ handleSearch: vi.fn(), navigate: vi.fn(), userSession: false }));

const SEGMENTS = [
  { name: 'call.cause', label: 'Cause', type: 'select', data: [{ value: 'answer', name: 'Answer' }, { value: 'busy', name: 'Busy' }] },
  { name: 'call.direction', label: 'Direction', type: 'select', data: [{ value: 'incoming', name: 'Incoming' }, { value: 'outgoing', name: 'Outgoing' }] },
  { name: 'call.caller', label: 'Caller', type: 'string' },
  { name: 'call.callee', label: 'Callee', type: 'string' },
  { name: 'call.queue_name', label: 'Queue', type: 'string' },
];

vi.mock('./Calls.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: () => ({
      columns: [], allRows: [], hasNextPage: false, currentPage: 1, totalPages: 1, totalRecords: 0,
      loadingCalls: false, loadingMore: false, errorCalls: null,
      fetchCalls: vi.fn(), loadMoreCalls: vi.fn(), goToPage: vi.fn(),
      dateRange: [new Date(2026, 9, 15), new Date(2026, 9, 15, 23, 59)], setDateRange: vi.fn(),
      sortModel: [], handleSortModelChange: vi.fn(), segments: hookState.segments, buildSearchQueryParams: () => ({}),
      aggregate: hookState.aggregate, aggregateLoading: false, fetchAggregate: vi.fn(),
      summaryCounts: actual.deriveSummary({
        aggregate: hookState.aggregate, durationAggregate: hookState.durationAggregate, failed: hookState.failed,
      }),
    }),
  };
});
vi.mock('./UrlSync/useUrlSync.js', () => ({ default: () => ({ currentSearchParams: hookState.params, setCurrentSearchParams: vi.fn(), syncUrl: vi.fn() }) }));
vi.mock('./RecordingHandlers/useRecordingHandlers.js', () => ({ default: () => ({}) }));
vi.mock('./ColumnHandlers/useColumnHandlers.jsx', () => ({ default: () => ({ visibleColumns: [], createGridColumns: () => [], handleColumnSelectorOpen: vi.fn() }) }));
vi.mock('./FilterHandlers/FilterHandlers.js', () => ({ default: () => ({ filteredRows: [], handleSearch: mocks.handleSearch, handleClearAllFilters: vi.fn() }) }));
vi.mock('./RowHandlers/useRowHandlers.js', () => ({ default: () => ({ rows: [], handleRowsScrollEnd: vi.fn(), scrollContainerRef: { current: null } }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ access: 'token' }) }));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ token: null }) }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => mocks.userSession }));
vi.mock('../../context/GlobalSearchContext', () => ({ useGlobalSearch: () => ({ registerScreen: vi.fn(), unregisterScreen: vi.fn() }) }));
vi.mock('../../context/NotificationContext', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }));
vi.mock('../../hooks/useNavigateToLogs', () => ({ useNavigateToEvents: () => vi.fn() }));
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => true }) }));
// The sidebar's live count, shared with the Live now chip.
vi.mock('../../hooks/useNavBadges', () => ({ default: () => ({ liveCalls: 3, criticalEvents: 0, openAlerts: 0, criticalAlerts: 0 }) }));
vi.mock('react-router', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => mocks.navigate }));
vi.mock('../shared/CentralizedSearch/CentralizedSearch.jsx', () => ({
  TOPBAR_SEARCH_SLOT_ID: 'topbar-search-slot',
  default: ({ hideDateRange, renderAs, placeholder, textParam }) => (
    <button type="button" data-testid="centralized-search" data-hide-date-range={String(Boolean(hideDateRange))} data-render-as={renderAs} data-placeholder={placeholder} data-text-param={textParam}>Filters</button>
  ),
}));
vi.mock('../../views/syslogs/TimeHistogram', () => ({ default: () => <div data-testid="histogram" /> }));
vi.mock('./RecordingDialog/RecordingDialog.jsx', () => ({ default: () => null }));
vi.mock('./ColumnSelector/ColumnSelector.jsx', () => ({ default: () => null }));
vi.mock('./FilterEditDialog/FilterEditDialog.jsx', () => ({ default: () => null }));
vi.mock('@mui/x-data-grid', () => ({ DataGrid: () => <div data-testid="grid" /> }));

import Calls from './Calls.jsx';

const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const chip = (key) => document.querySelector(`[data-stat="${key}"]`);

beforeEach(() => {
  hookState.aggregate = { cause: [], direction: [] };
  hookState.durationAggregate = null;
  hookState.failed = false;
  hookState.segments = SEGMENTS;
  hookState.params = {};
  mocks.userSession = false;
  mocks.handleSearch.mockClear();
  mocks.navigate.mockClear();
});

describe('Calls layout', () => {
  it('has no view tabs: the chart, then the counters and filters, then the table', () => {
    render(<Calls />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    const chart = screen.getByTestId('calls-chart');
    const counters = screen.getByTestId('calls-counters');
    expect(before(chart, counters)).toBe(true);
    expect(before(counters, screen.getByTestId('grid'))).toBe(true);
    // The filters are part of the counter row, not a row of their own.
    expect(within(counters).getByTestId('centralized-search')).toHaveAttribute('data-hide-date-range', 'true');
    expect(within(chart).getByTestId('calls-chart-date-range')).toBeInTheDocument();
  });

  it('toolbar: period, from/to, then refresh, export and columns, then grouping and bucket, then the collapse chevron', () => {
    render(<Calls />);
    const chart = screen.getByTestId('calls-chart');
    const wanted = ['Period', 'Refresh', 'Export CSV', 'Columns', 'Group by', 'Bucket', 'Hide chart'];
    const labels = Array.from(chart.querySelectorAll('[aria-label]'))
      .map((el) => el.getAttribute('aria-label'))
      .filter((l) => wanted.includes(l));
    expect(labels).toEqual(wanted);
    // from / to sit between the period and the actions.
    const range = within(chart).getByTestId('calls-chart-date-range');
    expect(before(within(chart).getByRole('group', { name: 'Period' }), range)).toBe(true);
    expect(before(range, within(chart).getByTestId('calls-toolbar-actions'))).toBe(true);
    // The three actions are one group of icon buttons, each named.
    const actions = within(chart).getByTestId('calls-toolbar-actions');
    expect(within(actions).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Refresh', 'Export CSV', 'Columns']);
    expect(within(chart).getByRole('button', { name: '7d' })).toBeInTheDocument();
  });

  // The phone's statistics fold; the desktop keeps every counter and its own
  // chart chevron, which still folds the chart and is remembered as before.
  it('keeps all the counters on the desktop, and the chart chevron folds and remembers', () => {
    localStorage.removeItem('reportsStrip:calls:collapsed');
    const first = render(<Calls />);
    expect(screen.queryByTestId('calls-stats-toggle')).toBeNull();
    ['total', 'answered', 'noAnswer', 'outgoing', 'incoming', 'avgDuration'].forEach((key) => expect(chip(key)).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Hide chart' }));
    expect(screen.getByRole('button', { name: 'Show chart' })).toBeInTheDocument();
    expect(localStorage.getItem('reportsStrip:calls:collapsed')).toBe('1');

    first.unmount();
    render(<Calls />);
    expect(screen.getByRole('button', { name: 'Show chart' })).toBeInTheDocument();
    localStorage.removeItem('reportsStrip:calls:collapsed');
  });

  it('counters are the quick filters: Answered writes search[call.cause][IS]=answer; Total clears', () => {
    const { unmount } = render(<Calls />);
    fireEvent.click(chip('answered'));
    expect(mocks.handleSearch).toHaveBeenCalledWith({ 'search[call.cause][IS]': ['answer'] }, false);
    unmount();

    hookState.params = { 'search[call.cause][IS]': ['answer'], 'search[call.queue_name][IS]': 'sales' };
    mocks.handleSearch.mockClear();
    render(<Calls />);
    expect(chip('answered')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('total')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip('total'));
    // Only the quick filters go; the queue stays.
    expect(mocks.handleSearch).toHaveBeenCalledWith({ 'search[call.queue_name][IS]': 'sales' }, false);
  });

  it('the five counters, the four pills and the search share one row', () => {
    render(<Calls />);
    const row = screen.getByTestId('calls-counters');
    expect(Array.from(row.querySelectorAll('[data-stat]')).map((el) => el.dataset.stat).slice(0, 5))
      .toEqual(['total', 'answered', 'noAnswer', 'outgoing', 'incoming']);
    const pills = within(row).getByTestId('filter-pills');
    expect(Array.from(pills.querySelectorAll('.MuiChip-root')).map((el) => el.textContent)).toEqual(['Cause', 'Direction', 'Caller', 'Callee']);
    const filters = within(row).getByTestId('centralized-search');
    // Not the Filters button: the search docks into the top bar.
    expect(filters).not.toHaveAttribute('data-render-as', 'button');
    expect(before(chip('incoming'), pills)).toBe(true);
    expect(before(pills, filters)).toBe(true);
    // One flex row that wraps.
    expect(getComputedStyle(row).display).toBe('flex');
  });

  it('docks an inline calls search into the top bar', () => {
    render(<Calls />);
    const search = screen.getByTestId('centralized-search');
    expect(search).toHaveAttribute('data-placeholder', 'Search caller, callee, user, route or call ID');
    expect(search).toHaveAttribute('data-text-param', 'search[inline]');
  });

  it('shows a Live now chip for an account and none for a user session', () => {
    const { unmount } = render(<Calls />);
    const live = chip('live');
    expect(live).toHaveTextContent('3');
    expect(live).toHaveTextContent('Live now');
    // Last in the row, after the filters.
    expect(before(screen.getByTestId('centralized-search'), live)).toBe(true);
    fireEvent.click(live);
    expect(mocks.navigate).toHaveBeenCalledWith('/live');
    unmount();

    mocks.userSession = true;
    render(<Calls />);
    expect(chip('live')).toBeNull();
    expect(chip('total')).toBeInTheDocument();
  });
});

describe('Calls counters and insights', () => {
  it('derives answer rate, average and total duration from the aggregate', () => {
    hookState.aggregate = {
      cause: [{ time: 't1', answer: 3, no_answer: 1 }, { time: 't2', answer: 1, busy: 1, unknown: 2, none: 2 }],
      direction: [{ time: 't1', incoming: 6, outgoing: 4 }],
    };
    hookState.durationAggregate = [{ time: 't1', answer: '300.0', no_answer: 20 }, { time: 't2', answer: 100, busy: 5, unknown: 0, none: 0 }];
    render(<Calls />);
    expect(chip('total')).toHaveTextContent('10');
    expect(chip('answered')).toHaveTextContent('4');
    // busy + no_answer; the two `none` and two missing causes are in neither.
    expect(chip('noAnswer')).toHaveTextContent('2');
    expect(chip('outgoing')).toHaveTextContent('4');
    expect(chip('incoming')).toHaveTextContent('6');
    // The rate rides on the Answered counter.
    expect(chip('answered')).toHaveTextContent('40%');
    expect(chip('avgDuration')).toHaveTextContent('1:40');   // 400s / 4 answered
    // Five filters, the average and the Live now chip: no total duration.
    expect(screen.getByTestId('calls-counters').querySelectorAll('[data-stat]')).toHaveLength(7);
    // The average is read-only; the counters stay toggles.
    expect(chip('avgDuration')).not.toHaveAttribute('role');
    expect(chip('answered')).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders "—" for what is unknown, never 0', () => {
    hookState.aggregate = { cause: [{ time: 't1', answer: 2 }], direction: [] };
    hookState.durationAggregate = null; // API without metric=duration
    render(<Calls />);
    expect(chip('answered')).toHaveTextContent('100%');
    expect(chip('avgDuration')).toHaveTextContent('—');
  });

  it('renders "—" everywhere when the aggregate failed', () => {
    hookState.failed = true;
    render(<Calls />);
    ['total', 'answered', 'noAnswer', 'outgoing', 'incoming', 'avgDuration'].forEach((key) => {
      expect(chip(key)).toHaveTextContent('—');
    });
  });
});

describe('Calls on a phone', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: true, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    });
  });
  afterEach(() => { window.matchMedia = realMatchMedia; });

  it('a user gets the period and the counters above the list, no chart', () => {
    mocks.userSession = true;
    render(<Calls />);
    const summary = screen.getByTestId('calls-mobile-summary');
    const period = within(summary).getByRole('group', { name: 'Period' });
    expect(within(period).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Today', '24h', '7d', '30d']);
    expect(chip('total')).not.toBeNull();
    expect(chip('incoming')).not.toBeNull();
    expect(screen.queryByTestId('calls-chart')).toBeNull();
  });

  // Open by default; folded, only the first box (Total) stays beside the
  // arrow, the period stays, and the choice is remembered in this browser.
  it('folds the statistics to the first box and remembers it', () => {
    localStorage.removeItem('calls:mobileStats:collapsed');
    const first = render(<Calls />);
    const toggle = screen.getByTestId('calls-stats-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(chip('total')).not.toBeNull();

    expect(chip('incoming')).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('Show statistics');
    expect(chip('total')).not.toBeNull();
    expect(chip('incoming')).toBeNull();
    expect(within(screen.getByTestId('calls-mobile-summary')).getByRole('group', { name: 'Period' })).toBeInTheDocument();

    first.unmount();
    render(<Calls />);
    expect(screen.getByTestId('calls-stats-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(chip('total')).not.toBeNull();
    expect(chip('answered')).toBeNull();
    localStorage.removeItem('calls:mobileStats:collapsed');
  });

  // A filter in use stays in sight when the statistics are folded.
  it('keeps the box of a filter in use when folded', () => {
    localStorage.setItem('calls:mobileStats:collapsed', '1');
    hookState.params = { 'search[call.cause][IS]': ['answer'] };
    render(<Calls />);
    expect(chip('total')).not.toBeNull();
    expect(chip('answered')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('incoming')).toBeNull();
    localStorage.removeItem('calls:mobileStats:collapsed');
  });
});
