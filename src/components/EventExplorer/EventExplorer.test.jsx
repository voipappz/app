import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/config';
import EventExplorer from './EventExplorer';
import { useEventExplorer } from './useEventExplorer';

vi.mock('./useEventExplorer', () => ({ useEventExplorer: vi.fn() }));

describe('EventExplorer', () => {
  it('shows DuckDB columns and opens the untouched raw event', () => {
    useEventExplorer.mockReturnValue({
      rows: [{
        event_id: 'raw-event-1', call_id: 'call-1', event_type: 'call.cdr', action: 'call.cdr',
        occurred_at: '2026-08-07 12:01:00', received_at: '2026-08-07 12:01:01',
        raw_payload: { call_uuid: 'call-1', metadata: { 'Event-Name': 'CHANNEL_HANGUP_COMPLETE' } },
        payload: { call_id: 'call-1' },
      }],
      total: 1, page: 0, perPage: 25,
      filters: { q: '', eventType: '', action: '', callId: '' },
      loading: false, error: null, disabled: false,
      setPage: vi.fn(), setPerPage: vi.fn(), setFilters: vi.fn(), refresh: vi.fn(),
    });

    render(<EventExplorer />);
    expect(screen.getAllByText('call.cdr')).toHaveLength(2);
    expect(screen.getByText('call-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('event-row-raw-event-1'));
    expect(screen.getByTestId('raw-event-dialog')).toHaveTextContent('CHANNEL_HANGUP_COMPLETE');
  });
});
