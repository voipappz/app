import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CallLogsPanel from './CallLogsPanel';
import { callsApi } from '../../../services/api/callsApi';

vi.mock('../../../services/api/callsApi', () => ({ callsApi: { getCallHistory: vi.fn() } }));

const call = { uuid: 'c1', profile: { direction: 'incoming', cause: 'answer', caller: '0541234567', callee: '201' } };
const earlier = { uuid: 'c0', created_at: '2026-10-10T08:00:00Z', profile: { direction: 'outgoing', cause: 'no_answer', caller: '201', callee: '0541234567' } };

describe('CallLogsPanel', () => {
  it("shows the call's history, and opens a call from it", async () => {
    callsApi.getCallHistory.mockResolvedValue([call, earlier]);
    const onOpenCall = vi.fn();
    render(<CallLogsPanel call={call} onBack={vi.fn()} onClose={vi.fn()} onOpenCall={onOpenCall} />);
    expect(callsApi.getCallHistory).toHaveBeenCalledWith('c1');
    fireEvent.click(await screen.findByRole('button', { name: /^Unanswered call to .*0541234567/ }));
    expect(onOpenCall).toHaveBeenCalledWith(earlier);
  });
});
