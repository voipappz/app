import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import { reportsApi } from '../../../services/api/reportsApi';
import ReportAuditDialog from './ReportAuditDialog';

vi.mock('../../../services/api/reportsApi', () => ({ reportsApi: { getAudits: vi.fn() } }));

const run = { event_id: 'e1', created_at: '2026-10-20T10:00:00Z', level: 'error', actor: 'dana@example.com', rows: 12, duration_ms: 340, params: 'queue=sales' };

afterEach(() => i18n.changeLanguage('en'));

describe('ReportAuditDialog', () => {
  it('lists the report runs: how each went, who ran it, rows and time', async () => {
    reportsApi.getAudits.mockResolvedValue([run]);
    render(<ReportAuditDialog open onClose={vi.fn()} reportName="Daily calls" />);
    expect(screen.getByText('Report run history')).toBeInTheDocument();
    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('dana@example.com')).toBeInTheDocument();
    expect(screen.getByText('340 ms')).toBeInTheDocument();
    expect(screen.getByText('queue=sales')).toBeInTheDocument();
    expect(reportsApi.getAudits).toHaveBeenCalledWith('Daily calls', 100);
  });

  it('says so when the report has never run', async () => {
    reportsApi.getAudits.mockResolvedValue([]);
    render(<ReportAuditDialog open onClose={vi.fn()} reportName="Daily calls" />);
    expect(await screen.findByText('No recorded runs for this report yet.')).toBeInTheDocument();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    reportsApi.getAudits.mockResolvedValue([run]);
    render(<ReportAuditDialog open onClose={vi.fn()} reportName="Daily calls" />);
    expect(screen.getByText('היסטוריית הרצות הדוח')).toBeInTheDocument();
    expect(await screen.findByText('נכשלה')).toBeInTheDocument();
  });
});
