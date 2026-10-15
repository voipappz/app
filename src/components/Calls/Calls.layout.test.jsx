import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Calls screen rendered for real; the data hook, handlers and heavy panels
// are stubbed so what is under test is the layout and the counters.
const hookState = { aggregate: { cause: [], direction: [] }, durationAggregate: null, failed: false };

vi.mock('./Calls.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: () => ({
      columns: [], allRows: [], hasNextPage: false, currentPage: 1, totalPages: 1, totalRecords: 0,
      loadingCalls: false, loadingMore: false, errorCalls: null,
      fetchCalls: vi.fn(), loadMoreCalls: vi.fn(), goToPage: vi.fn(),
      dateRange: [new Date(2026, 9, 15), new Date(2026, 9, 15, 23, 59)], setDateRange: vi.fn(),
      sortModel: [], handleSortModelChange: vi.fn(), segments: [], buildSearchQueryParams: () => ({}),
      aggregate: hookState.aggregate, aggregateLoading: false, fetchAggregate: vi.fn(),
      summaryCounts: actual.deriveSummary({
        aggregate: hookState.aggregate, durationAggregate: hookState.durationAggregate, failed: hookState.failed,
      }),
    }),
  };
});
vi.mock('./UrlSync/useUrlSync.js', () => ({ default: () => ({ currentSearchParams: {}, setCurrentSearchParams: vi.fn(), syncUrl: vi.fn() }) }));
vi.mock('./RecordingHandlers/useRecordingHandlers.js', () => ({ default: () => ({}) }));
vi.mock('./ColumnHandlers/useColumnHandlers.jsx', () => ({ default: () => ({ visibleColumns: [], createGridColumns: () => [] }) }));
vi.mock('./FilterHandlers/FilterHandlers.js', () => ({ default: () => ({ filteredRows: [], handleSearch: vi.fn(), handleClearAllFilters: vi.fn() }) }));
vi.mock('./RowHandlers/useRowHandlers.js', () => ({ default: () => ({ rows: [], handleRowsScrollEnd: vi.fn(), scrollContainerRef: { current: null } }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ access: 'token' }) }));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ token: null }) }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));
vi.mock('../../context/GlobalSearchContext', () => ({ useGlobalSearch: () => ({ registerScreen: vi.fn(), unregisterScreen: vi.fn() }) }));
vi.mock('../../context/NotificationContext', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }));
vi.mock('../../hooks/useNavigateToLogs', () => ({ useNavigateToEvents: () => vi.fn() }));
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => true }) }));
vi.mock('../Live/useLiveCalls', () => ({ useLiveCalls: () => ({ totalCount: 2, refresh: vi.fn() }) }));
vi.mock('../shared/LogTabs/LogTabs.jsx', () => ({ default: () => <div data-testid="log-tabs" /> }));
vi.mock('../shared/CentralizedSearch/CentralizedSearch.jsx', () => ({
  default: ({ hideDateRange }) => <div data-testid="centralized-search" data-hide-date-range={String(Boolean(hideDateRange))} />,
}));
vi.mock('../shared/EnhancedDateRangePicker/EnhancedDateRangePicker.jsx', () => ({ default: () => <div data-testid="date-range-picker" /> }));
vi.mock('../../views/syslogs/TimeHistogram', () => ({ default: () => <div data-testid="histogram" /> }));
vi.mock('../Live/LiveDrawer.jsx', () => ({ default: () => null }));
vi.mock('../Live/panels/LiveCallsPanel.jsx', () => ({ default: () => null }));
vi.mock('../Live/LiveChartStrip.jsx', () => ({ default: () => null }));
vi.mock('../Reports/ReportsPanel/ReportsPanel.jsx', () => ({ default: () => null }));
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
});

describe('Calls layout', () => {
  it('puts the chart directly under the tabs, above the counters and the table', () => {
    render(<Calls />);
    const tabs = screen.getByTestId('log-tabs');
    const chart = screen.getByTestId('calls-chart');
    const counters = screen.getByTestId('calls-counters');
    expect(before(tabs, chart)).toBe(true);
    expect(tabs.nextElementSibling).toBe(chart);
    expect(before(chart, counters)).toBe(true);
    expect(before(counters, screen.getByTestId('grid'))).toBe(true);
  });

  it('keeps the date range in the chart toolbar, before the group-by, and out of the top bar search', () => {
    render(<Calls />);
    const chart = screen.getByTestId('calls-chart');
    const picker = within(chart).getByTestId('date-range-picker');
    expect(before(picker, within(chart).getByText('by'))).toBe(true);
    expect(before(picker, within(chart).getByRole('button', { name: 'Hourly' }))).toBe(true);
    expect(screen.getAllByTestId('date-range-picker')).toHaveLength(1);
    expect(screen.getByTestId('centralized-search')).toHaveAttribute('data-hide-date-range', 'true');
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
    expect(chip('answerRate')).toHaveTextContent('40%');
    expect(chip('avgDuration')).toHaveTextContent('1:40');   // 400s / 4 answered
    expect(chip('totalDuration')).toHaveTextContent('7:05'); // 425s
    // Insights are read-only; the counters stay toggles.
    expect(chip('answerRate')).not.toHaveAttribute('role');
    expect(chip('answered')).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders "—" for what is unknown, never 0', () => {
    hookState.aggregate = { cause: [{ time: 't1', answer: 2 }], direction: [] };
    hookState.durationAggregate = null; // API without metric=duration
    render(<Calls />);
    expect(chip('answerRate')).toHaveTextContent('100%');
    expect(chip('avgDuration')).toHaveTextContent('—');
    expect(chip('totalDuration')).toHaveTextContent('—');
  });

  it('renders "—" everywhere when the aggregate failed', () => {
    hookState.failed = true;
    render(<Calls />);
    ['total', 'answered', 'noAnswer', 'answerRate', 'avgDuration', 'totalDuration'].forEach((key) => {
      expect(chip(key)).toHaveTextContent('—');
    });
  });
});
