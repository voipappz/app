import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ access: 'token' }) }));
vi.mock('../../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => false }) }));
vi.mock('../../../services/conversationService', () => ({ default: { getConversationByCallId: vi.fn(async () => null) } }));
vi.mock('./CallTimeline', () => ({ default: () => null }));

import CallDetailPanel from './CallDetailPanel.jsx';

describe('CallDetailPanel', () => {
  it("shows the selected call's profile fields", async () => {
    render(<CallDetailPanel call={{
      uuid: 'call-1', created_at: '2026-10-15T10:00:00Z',
      profile: { caller: '0501234567', callee: '1001', direction: 'incoming', cause: 'answer',
        talk_duration: '61', duration: '70', did_name: 'Main line', sip_call_id: 'abc@host', state: 'hangup' },
    }} onClose={vi.fn()} />);
    const profile = await screen.findByTestId('call-profile');
    expect(within(profile).getByText('Main line')).toBeInTheDocument();
    expect(within(profile).getByText('abc@host')).toBeInTheDocument();
    expect(within(profile).getByText('1:10')).toBeInTheDocument();
    expect(within(profile).getByText('hangup')).toBeInTheDocument();
  });
});
