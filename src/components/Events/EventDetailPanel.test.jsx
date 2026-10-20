import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EventDetailPanel, { syslogLink } from './EventDetailPanel';

const failed = {
  id: 1,
  event_id: 'e-1',
  event_type: 'EventAudit',
  action: 'webhook.failed',
  time: '2026-10-20T10:59:00.000',
  data: { action: 'webhook.failed', step: 'scalla.send_event', error: 'Scalla answered 500: boom' },
  metadata: { call_uuid: '2a8c0072', service_uuid: 'svc-1' },
};

describe('EventDetailPanel', () => {
  it('shows every data and metadata field, the error included', () => {
    render(<EventDetailPanel event={failed} message="webhook.failed · scalla.send_event: Scalla answered 500: boom" onClose={() => {}} />);
    expect(screen.getByTestId('event-detail-data-error')).toHaveTextContent('Scalla answered 500: boom');
    expect(screen.getByTestId('event-detail-data-step')).toHaveTextContent('scalla.send_event');
    expect(screen.getByTestId('event-detail-metadata-call_uuid')).toHaveTextContent('2a8c0072');
    expect(screen.getByTestId('event-detail-metadata-service_uuid')).toHaveTextContent('svc-1');
    expect(screen.getByTestId('event-detail-message')).toHaveTextContent('Scalla answered 500: boom');
  });

  it('closes', () => {
    const onClose = vi.fn();
    render(<EventDetailPanel event={failed} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing without an event', () => {
    const { container } = render(<EventDetailPanel event={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links to Syslog on the call, over a period that reaches the event', () => {
    const now = Date.parse('2026-10-20T12:00:00.000');
    expect(syslogLink(failed, now)).toBe('/logs?search=2a8c0072&period=3h');
    expect(syslogLink({ data: { type: 'call', type_uuid: 'c1' }, time: '2026-10-20T11:55:00.000' }, now))
      .toBe('/logs?search=c1&period=1h');
    expect(syslogLink({ data: { action: 'x' } }, now)).toBeNull();
  });

  it('shows the Syslog button only when the event names a call or session', () => {
    render(<EventDetailPanel event={failed} onClose={() => {}} />);
    expect(screen.getByTestId('event-detail-syslog')).toHaveAttribute('href', expect.stringContaining('search=2a8c0072'));
  });
});
