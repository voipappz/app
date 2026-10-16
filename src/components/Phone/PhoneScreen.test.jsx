import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import PhoneScreen from './PhoneScreen.jsx';

// The user portal gets the call room (avatars with audio bars, "Call
// duration", round labelled controls, a round Hang up, Answer / Decline while
// ringing). An account keeps the console phone it has today.
let userSession = true;
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => userSession }));

let call;
const softphone = {
  status: 'registered', connected: true, muted: false, held: false, networkAvailable: true,
  streams: { local: null, remote: null },
  dial: vi.fn(), answer: vi.fn(), hangup: vi.fn(), sendDtmf: vi.fn(), setMuted: vi.fn(), setHeld: vi.fn(),
  settings: { deviceUuid: 'dev-1', username: '2300', displayName: 'Dana' }, logs: []
};
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ ...softphone, call }) }));
vi.mock('../../context/PortalSidebarContext', () => ({ usePortalSidebar: () => ({ open: vi.fn() }) }));
vi.mock('../../lib/sip/useIncomingCallAlerts.js', () => ({ requestIncomingCallNotifications: async () => {}, useIncomingCallAlerts: () => {} }));
vi.mock('./PhoneCallsTab.jsx', () => ({ default: () => <div data-testid="calls-tab" /> }));
vi.mock('./PhoneSessionSignOut.jsx', () => ({ default: () => <button>Sign out</button> }));
vi.mock('./PhonePresence.jsx', () => ({ default: () => null }));
vi.mock('./TransferControls.jsx', () => ({ default: () => null }));
vi.mock('./CallToast.jsx', () => ({ default: () => null }));

const active = { id: 'c1', direction: 'inbound', remote: '0525550144', state: 'active', connectedAt: Date.now() };

beforeEach(() => {
  vi.clearAllMocks();
  userSession = true;
  call = active;
});

describe('the phone in the user portal', () => {
  it('shows the call room with labelled round controls and the keypad closed until asked', () => {
    render(<PhoneScreen embedded />);
    expect(screen.getByText('Call duration')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    for (const name of ['Mute', 'Hold', 'Transfer', 'Keypad']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Connected');
    expect(screen.queryByRole('button', { name: '#' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keypad' }));
    fireEvent.click(screen.getByRole('button', { name: '#' }));
    expect(softphone.sendDtmf).toHaveBeenCalledWith('#');
  });

  it('hangs up from the round button in the bar', () => {
    render(<PhoneScreen embedded />);
    fireEvent.click(screen.getByRole('button', { name: 'Hang up' }));
    expect(softphone.hangup).toHaveBeenCalled();
  });

  it('offers Answer and Decline on an incoming call', () => {
    call = { ...active, state: 'ringing', connectedAt: null };
    render(<PhoneScreen embedded />);
    expect(screen.queryByText('Call duration')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(softphone.answer).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(softphone.hangup).toHaveBeenCalled();
  });

  it('names the dialpad keys and the Call button', () => {
    call = null;
    render(<PhoneScreen embedded initialTab="dialpad" />);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByLabelText('Enter number')).toHaveValue('5');
    expect(screen.getByRole('button', { name: 'Call' })).toBeInTheDocument();
  });
});

describe('the phone in the account console', () => {
  beforeEach(() => { userSession = false; });

  it('keeps the icon controls and the always-open keypad', () => {
    render(<PhoneScreen embedded />);
    expect(screen.queryByRole('button', { name: 'Keypad' })).toBeNull();
    expect(screen.queryByText('Call duration')).toBeNull();
    expect(screen.getByTestId('phone-hold')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '#' }));
    expect(softphone.sendDtmf).toHaveBeenCalledWith('#');
    expect(screen.getByRole('button', { name: 'Hang up' })).toBeInTheDocument();
  });
});
