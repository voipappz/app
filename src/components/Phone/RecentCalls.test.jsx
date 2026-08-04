// Surface-level checks for the dock's Calls tab: that history reaches the
// screen only once the tab is open, and that a row is a way into /calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../lib/clients/api', () => ({ apiList: vi.fn() }));

import { apiList } from '../../lib/clients/api';
import RecentCalls from './RecentCalls';
import '../../i18n/config';

const row = (uuid, direction = 'incoming') => ({
  uuid,
  created_at: '2026-08-04T10:00:00Z',
  updated_at: '2026-08-04T10:01:00Z',
  meta: { _direction: direction, _contact_number: '0501234567', _did_number: '+233308040110' },
});

const renderTab = (props) => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes>
      <Route path="/dashboard" element={<RecentCalls {...props} />} />
      <Route path="/calls" element={<div>calls page</div>} />
    </Routes>
  </MemoryRouter>,
);

describe('RecentCalls', () => {
  beforeEach(() => {
    apiList.mockReset();
    apiList.mockResolvedValue({ rows: [row('c-1'), row('c-2', 'outgoing')], total: 2 });
  });

  it('stays quiet — and asks the API nothing — while the tab is closed', async () => {
    renderTab({ active: false });
    await waitFor(() => expect(screen.getByTestId('phone-recent-calls')).toBeInTheDocument());
    expect(apiList).not.toHaveBeenCalled();
    expect(screen.queryByTestId('phone-recent-call')).toBeNull();
  });

  it('lists the last calls with the other party’s number once opened', async () => {
    renderTab({ active: true });
    await waitFor(() => expect(screen.getAllByTestId('phone-recent-call')).toHaveLength(2));
    // the contact, never our own DID
    expect(screen.getAllByText('0501234567')).toHaveLength(2);
    expect(screen.queryByText('+233308040110')).toBeNull();
  });

  it('takes you to the Calls page when a row is clicked', async () => {
    const onNavigate = vi.fn();
    renderTab({ active: true, onNavigate });
    await waitFor(() => expect(screen.getAllByTestId('phone-recent-call')).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId('phone-recent-call')[0]);
    expect(screen.getByText('calls page')).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalled();   // lets the dock close itself
  });

  it('says so, quietly, when the list cannot be loaded', async () => {
    apiList.mockRejectedValue(new Error('/api/calls → 500'));
    renderTab({ active: true });
    await waitFor(() => expect(screen.getByTestId('phone-recent-error')).toBeInTheDocument());
    expect(screen.queryByTestId('phone-recent-call')).toBeNull();
  });
});
