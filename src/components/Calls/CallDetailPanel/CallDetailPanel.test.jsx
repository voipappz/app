import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';

// Who is signed in: an account (admin) unless a test signs in a portal user.
const session = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../../../hooks/useIsUserSession', () => ({ useSessionRole: () => session.role }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ access: 'token' }) }));
vi.mock('../../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: () => false }) }));
vi.mock('../../../hooks/useDialNow', () => ({ useDialNow: () => ({ canDial: true, dialNow: vi.fn() }) }));
vi.mock('../../../services/conversationService', () => ({ default: { getConversationByCallId: vi.fn(async () => null) } }));
vi.mock('./CallTimeline', () => ({ default: () => null }));
vi.mock('../CallHistory/CallHistory', () => ({ default: () => <div>other calls</div> }));

import CallDetailPanel from './CallDetailPanel.jsx';

const call = {
  uuid: 'call-1', created_at: '2026-10-15T10:00:00Z',
  profile: { caller: '0501234567', callee: '1001', direction: 'incoming', cause: 'answer',
    talk_duration: '61', duration: '70', did_name: 'Main line', sip_call_id: 'abc@host', state: 'hangup' },
};

afterEach(() => {
  session.role = 'admin';
  return i18n.changeLanguage('en');
});

describe('CallDetailPanel', () => {
  it('tells the call in one look: direction, result, who to whom, how long, and Call back', () => {
    render(<CallDetailPanel call={call} onClose={vi.fn()} />);
    const summary = screen.getByTestId('call-summary');
    expect(within(summary).getByText('Incoming')).toBeInTheDocument();
    expect(within(summary).getByText('Answered')).toBeInTheDocument();
    expect(within(summary).getByText('050-123-4567')).toBeInTheDocument();
    expect(within(summary).getByText(/talked 1:01/)).toBeInTheDocument();
    expect(within(summary).getByTestId('call-detail-call-back')).toBeInTheDocument();
  });

  it('opens on Summary with the facts people ask about, and the switch details behind a closed section', () => {
    render(<CallDetailPanel call={call} onClose={vi.fn()} />);
    const tab = screen.getByTestId('call-detail-summary-tab');
    expect(within(tab).getByText('Route')).toBeInTheDocument();
    expect(within(tab).getByText('Main line')).toBeInTheDocument();
    expect(screen.queryByText('abc@host')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('call-detail-technical'));
    const technical = screen.getByTestId('call-profile');
    expect(within(technical).getByText('abc@host')).toBeInTheDocument();
    expect(within(technical).getByText('1:10')).toBeInTheDocument();
    expect(within(technical).getByText('hangup')).toBeInTheDocument();
    expect(within(technical).getByText('call-1')).toBeInTheDocument();
    // Shown in the summary already, so not again here.
    expect(within(technical).queryByText('Main line')).not.toBeInTheDocument();
  });

  it('never shows the technical details to a portal user', () => {
    session.role = 'user';
    render(<CallDetailPanel call={call} onClose={vi.fn()} />);
    expect(screen.queryByTestId('call-detail-technical')).not.toBeInTheDocument();
  });

  it('offers History only where another call can be opened', () => {
    const { unmount } = render(<CallDetailPanel call={call} onClose={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
    unmount();

    render(<CallDetailPanel call={call} onClose={vi.fn()} onOpenCall={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('other calls')).toBeInTheDocument();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    render(<CallDetailPanel call={{ ...call, profile: { ...call.profile, cause: 'no_answer' } }} onClose={vi.fn()} />);
    expect(screen.getByText('פרטי השיחה')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'סיכום' })).toBeInTheDocument();
    expect(screen.getByText('לא נענתה')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'סגירת פרטי השיחה' })).toBeInTheDocument();
  });
});
