import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CallTimeline from './CallTimeline';
import { eventsApi } from '../../../services/api/eventsApi';

vi.mock('../../../services/api/eventsApi', () => ({ eventsApi: { fetchLogs: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('CallTimeline', () => {
  it("lists the call's events in order, in words, and opens one", async () => {
    eventsApi.fetchLogs.mockResolvedValue({ data: [
      { event_id: 'e1', event_type: 'EventCdr', time: '2026-10-04T10:00:00.000', data: { va_call_uuid: 'c-1' }, metadata: {} },
      { event_id: 'e2', event_type: 'ServiceLog', msg: 'webhook ran', level: 'error', time: '2026-10-04T10:00:05.000', data: {}, metadata: { call_uuid: 'c-1' } },
    ] });
    const onOpenEvents = vi.fn();
    const user = userEvent.setup();
    render(<CallTimeline callUuid="c-1" onOpenEvents={onOpenEvents} />);

    expect(await screen.findByText('Call record saved')).toBeInTheDocument();
    expect(screen.getByText('Service log')).toBeInTheDocument();
    expect(screen.getByText('webhook ran')).toBeInTheDocument();
    expect(eventsApi.fetchLogs).toHaveBeenCalledWith(expect.objectContaining({ subject: 'call', subject_uuid: 'c-1', order_type: 'asc' }));

    await user.click(screen.getByText('Call record saved'));
    expect(screen.getByText(/va_call_uuid/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open in Events' }));
    expect(onOpenEvents).toHaveBeenCalled();
  });

  it('says so when the call has no events', async () => {
    eventsApi.fetchLogs.mockResolvedValue({ data: [] });
    render(<CallTimeline callUuid="c-2" />);
    expect(await screen.findByText('No events for this call yet.')).toBeInTheDocument();
  });
});
