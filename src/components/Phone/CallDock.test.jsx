import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Dialog, Drawer, TextField } from '@mui/material';
import i18n from '../../i18n';
import { Z } from '../../utils/zIndex';
import CallDock from './CallDock.jsx';

// The softphone, as useSoftphone gives it; each test sets the call.
let phone;
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => phone }));
let sidebar;
vi.mock('../../context/PortalSidebarContext', () => ({ usePortalSidebar: () => sidebar }));
// The ringtone and the browser notification are not this file's subject.
vi.mock('../../lib/sip/useIncomingCallAlerts.js', () => ({
  requestIncomingCallNotifications: vi.fn(), useIncomingCallAlerts: vi.fn(),
}));

const ringingCall = { id: 'c1', direction: 'inbound', state: 'ringing', remote: '0501234567' };
const activeCall = (over = {}) => ({ id: 'c2', direction: 'outbound', state: 'active', remote: '0529876543', connectedAt: Date.now() - 65_000, ...over });

beforeEach(() => {
  phone = {
    status: 'registered', call: null, muted: false, held: false,
    answer: vi.fn(), hangup: vi.fn(), setMuted: vi.fn(), setHeld: vi.fn(async () => {}),
  };
  sidebar = { view: null, open: vi.fn() };
});
afterEach(() => i18n.changeLanguage('en'));

// A form being edited in a dialog, and the dock beside it, as in the app.
function EditingAForm({ withDialog = true }) {
  return (
    <>
      {withDialog && (
        <Dialog open>
          <TextField label="Route name" defaultValue="Night line" />
        </Dialog>
      )}
      <CallDock />
    </>
  );
}

describe('an incoming call while a form is open', () => {
  // The dialog opens first and the call arrives during the edit: the usual case.
  const ringDuringEdit = () => {
    const view = render(<EditingAForm />);
    phone.call = ringingCall;
    view.rerender(<EditingAForm />);
    return view;
  };

  it('shows above every dialog layer', () => {
    ringDuringEdit();
    const card = screen.getByRole('alert');
    expect(within(card).getByText('Incoming call')).toBeInTheDocument();
    expect(within(card).getByText('0501234567')).toBeInTheDocument();
    const slot = screen.getByTestId('call-dock-slot');
    expect(Number(getComputedStyle(slot).zIndex)).toBe(Z.CALL);
    expect(Z.CALL).toBeGreaterThan(Z.PHONE_POPUP);
    expect(Z.PHONE).toBeGreaterThan(Z.CONFIRM);
  });

  it('answers without opening the phone or touching the form', () => {
    ringDuringEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(phone.answer).toHaveBeenCalled();
    expect(sidebar.open).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Route name' })).toHaveValue('Night line');
  });

  it('declines', () => {
    ringDuringEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(phone.hangup).toHaveBeenCalled();
  });
});

describe('a call in progress', () => {
  it('shows the caller, the time, and mute, hold, open phone and hang up', async () => {
    phone.call = activeCall();
    render(<EditingAForm withDialog={false} />);
    const bar = screen.getByTestId('in-call-bar');
    expect(within(bar).getByText('0529876543')).toBeInTheDocument();
    expect(within(bar).getByTestId('in-call-status')).toHaveTextContent('01:05');

    fireEvent.click(within(bar).getByRole('button', { name: 'Mute' }));
    expect(phone.setMuted).toHaveBeenCalledWith(true);
    await act(async () => { fireEvent.click(within(bar).getByRole('button', { name: 'Hold' })); });
    expect(phone.setHeld).toHaveBeenCalledWith(true);
    fireEvent.click(within(bar).getByRole('button', { name: 'Open phone' }));
    expect(sidebar.open).toHaveBeenCalledWith('phone');
    fireEvent.click(within(bar).getByRole('button', { name: 'Hang up' }));
    expect(phone.hangup).toHaveBeenCalled();
  });

  it('holds only a connected call, and says when it is on hold', () => {
    phone.call = activeCall({ state: 'connecting', connectedAt: undefined });
    const view = render(<CallDock />);
    expect(screen.getByRole('button', { name: 'Hold' })).toBeDisabled();

    phone = { ...phone, call: activeCall(), held: true, muted: true };
    view.rerender(<CallDock />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('in-call-status')).toHaveTextContent('On hold');
  });

  it('leaves the call to the phone while the phone is open', () => {
    phone.call = activeCall();
    sidebar.view = 'phone';
    render(<CallDock />);
    expect(screen.queryByTestId('in-call-bar')).toBeNull();
  });
});

// The phone's one home: the same corner on every page and over every dialog.
describe('the phone button', () => {
  it('is on every page, and opens the phone', () => {
    render(<EditingAForm withDialog={false} />);
    const button = screen.getByTestId('phone-launcher');
    expect(button).toHaveAccessibleName('Open phone');
    expect(Number(getComputedStyle(button).zIndex)).toBe(Z.CALL);
    fireEvent.click(button);
    expect(sidebar.open).toHaveBeenCalledWith('phone');
  });

  // Below `md` a covering dialog is full screen, with its Save bar at the
  // bottom: the button rises above the bar instead of covering it.
  it('stays in its corner over a dialog, lifted clear of its Save bar', async () => {
    const view = render(<EditingAForm withDialog={false} />);
    expect(screen.getByTestId('phone-launcher')).not.toHaveAttribute('data-lifted');

    view.rerender(<EditingAForm />);
    await waitFor(() => expect(screen.getByTestId('phone-launcher')).toHaveAttribute('data-lifted', 'true'));

    view.rerender(<EditingAForm withDialog={false} />);
    await waitFor(() => expect(screen.getByTestId('phone-launcher')).not.toHaveAttribute('data-lifted'));
  });

  // A route's details on a phone is a full-screen drawer, with buttons at the bottom too.
  it('is lifted over a drawer that covers the page', async () => {
    render(<><Drawer open anchor="right">Route details</Drawer><CallDock /></>);
    await waitFor(() => expect(screen.getByTestId('phone-launcher')).toHaveAttribute('data-lifted', 'true'));
  });

  it('says a call is ringing, and steps aside while the phone is open', () => {
    phone.call = ringingCall;
    const view = render(<CallDock />);
    expect(screen.getByTestId('phone-launcher')).toHaveAccessibleName('Incoming call — open phone');

    sidebar.view = 'phone';
    view.rerender(<CallDock />);
    expect(screen.queryByTestId('phone-launcher')).toBeNull();
  });
});

describe('the call dock in Hebrew', () => {
  it('names its controls in Hebrew', async () => {
    await i18n.changeLanguage('he');
    phone.call = activeCall();
    render(<EditingAForm withDialog={false} />);
    const bar = screen.getByTestId('in-call-bar');
    expect(within(bar).getByRole('button', { name: 'השתקה' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'המתנה' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'סיום שיחה' })).toBeInTheDocument();
    expect(screen.getByTestId('phone-launcher')).toHaveAccessibleName('פתיחת הטלפון');
  });
});
