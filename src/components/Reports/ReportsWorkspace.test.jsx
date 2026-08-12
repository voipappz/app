import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import ReportsWorkspace, { presetRange } from './ReportsWorkspace';
import useReportsWorkspace from './useReportsWorkspace';

vi.mock('./useReportsWorkspace', () => ({ default: vi.fn() }));
vi.mock('./ReportChart', () => ({
  default: ({ report }) => <div data-testid="report-result">{report.rows.length} rows</div>,
}));

const selectReport = vi.fn();
const refreshReport = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
  useReportsWorkspace.mockReturnValue({
    reports: [{ uuid: 'r1', name: 'Calls by extension' }],
    selectedReport: null,
    result: null,
    loadingReports: false,
    loadingResult: false,
    reportsError: null,
    resultError: null,
    selectReport,
    refreshReport,
  });
});

describe('ReportsWorkspace', () => {
  it('shows the report list and opens one report with the current filters', () => {
    selectReport.mockResolvedValue(null);
    render(<ReportsWorkspace />);
    fireEvent.click(screen.getByTestId('report-r1'));
    expect(selectReport).toHaveBeenCalledWith(
      { uuid: 'r1', name: 'Calls by extension' },
      expect.objectContaining({ groupBy: 'day' }),
    );
  });

  it('renders a selected result and lets the user run it again', () => {
    useReportsWorkspace.mockReturnValue({
      reports: [{ uuid: 'r1', name: 'Calls by extension' }],
      selectedReport: { uuid: 'r1', name: 'Calls by extension' },
      result: { name: 'Calls by extension', columns: ['Extension', 'Calls'], rows: [{ Extension: '1001', Calls: 2 }] },
      loadingReports: false,
      loadingResult: false,
      reportsError: null,
      resultError: null,
      selectReport,
      refreshReport,
    });
    render(<ReportsWorkspace />);
    expect(screen.getByTestId('report-result')).toHaveTextContent('1 rows');
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
    expect(refreshReport).toHaveBeenCalledWith(expect.objectContaining({ groupBy: 'day' }));
  });

  it('builds inclusive local calendar presets', () => {
    const now = new Date(2026, 7, 12, 14, 30);
    expect(presetRange('today', now)).toEqual({ startDate: '2026-08-12', endDate: '2026-08-12' });
    expect(presetRange('d7', now)).toEqual({ startDate: '2026-08-06', endDate: '2026-08-12' });
    expect(presetRange('d30', now)).toEqual({ startDate: '2026-07-14', endDate: '2026-08-12' });
  });
});
