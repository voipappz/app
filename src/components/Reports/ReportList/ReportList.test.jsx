import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import ReportList from './ReportList';

const reports = [
  { uuid: 'r1', name: 'Daily calls', source: 'template', type: 'line' },
  { uuid: 'r2', name: 'Queue load', type: 'table' },
];
const renderList = (props = {}) => render(
  <ReportList reports={reports} selectedReportUuid={null} onSelect={vi.fn()} onCreateClick={vi.fn()}
    onFork={vi.fn()} onDelete={vi.fn()} {...props} />,
);

afterEach(() => i18n.changeLanguage('en'));

describe('ReportList', () => {
  it('lists the reports by their own names, with their kind', () => {
    renderList();
    expect(screen.getByRole('button', { name: 'New Report' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
    expect(screen.getByText('Daily calls')).toBeInTheDocument();
    expect(screen.getByText('template')).toBeInTheDocument();
    expect(screen.getByText('line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fork Daily calls' })).toBeInTheDocument();
  });

  it('offers no New Report without write access', () => {
    renderList({ canWrite: false });
    expect(screen.queryByRole('button', { name: 'New Report' })).not.toBeInTheDocument();
  });

  it('speaks Hebrew, keeping the report names as they are', async () => {
    await i18n.changeLanguage('he');
    renderList();
    expect(screen.getByRole('button', { name: 'דוח חדש' })).toBeInTheDocument();
    expect(screen.getByText('תבנית')).toBeInTheDocument();
    expect(screen.getByText('קווי')).toBeInTheDocument();
    expect(screen.getByText('Daily calls')).toBeInTheDocument();
  });
});
