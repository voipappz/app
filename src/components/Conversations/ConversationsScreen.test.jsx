import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ConversationsScreen from './ConversationsScreen.jsx';

let granted;
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: (k) => granted.includes(k) }) }));
let phoneCall;
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ call: phoneCall }) }));
vi.mock('../LiveDashboard/useLiveEnvironment', () => ({ useLiveEnvironment: () => ({ uuid: 'env-1' }) }));
vi.mock('../../hooks/useLiveEntities', () => ({
  default: () => ({
    connected: true,
    byScope: () => [{ live_calls_incoming: [{ call_uuid: 'live-1', from_number: '0525550144' }] }],
  }),
}));
vi.mock('../Phone/PhoneScreen.jsx', () => ({ default: () => <div data-testid="phone-screen" /> }));
vi.mock('../../services/api/conversationsApi', () => ({
  conversationsApi: {
    list: vi.fn(async () => ({ data: [{ call_uuid: 'h-1', remote_number: '0501112222', direction: 'incoming', started_at: '2026-10-16T10:00:00Z', contact: { name: 'Dan Levi' } }] })),
    events: vi.fn(async () => ({ data: [
      { id: 1, at: '2026-10-16T10:00:00Z', kind: 'call', text: 'Answered by Dana' },
      { id: 2, at: '2026-10-16T10:01:00Z', kind: 'note', text: 'Send the price list' },
    ] })),
    addNote: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock('../../services/api/contactsApi', () => ({
  contactsApi: {
    fields: vi.fn(async () => ({ data: [{ key: 'plan', label: 'Plan interest', type: 'text' }] })),
    lookup: vi.fn(async () => ({ data: { uuid: 'ct-1' } })),
    get: vi.fn(async () => ({ data: { uuid: 'ct-1', phone: '0525550144', name: 'Yael Cohen', email: '', fields: { plan: 'Annual' }, meta: { renewal: '' }, previous: [] } })),
    update: vi.fn(async () => ({ data: {} })),
    create: vi.fn(),
  },
}));
vi.mock('../../services/api/messagesApi', () => ({ messagesApi: { send: vi.fn() } }));

import { conversationsApi } from '../../services/api/conversationsApi';
import { contactsApi } from '../../services/api/contactsApi';

beforeEach(() => {
  vi.clearAllMocks();
  granted = ['calls', 'notes', 'messages', 'contacts'];
  phoneCall = null;
});

describe('Conversations screen', () => {
  it('shows live rows from the cable and loads the thread of the selected one', async () => {
    render(<ConversationsScreen />);
    fireEvent.click(await screen.findByTestId('session-row'));
    expect(await screen.findByText('Answered by Dana')).toBeInTheDocument();
    expect(conversationsApi.events).toHaveBeenCalledWith('live-1');
    expect(screen.getByTestId('event-note')).toHaveTextContent('Send the price list');
    expect(conversationsApi.list).not.toHaveBeenCalled();
  });

  it('selects the conversation of the phone call', async () => {
    phoneCall = { id: 'live-1', state: 'active', remote: '0525550144' };
    render(<ConversationsScreen />);
    await waitFor(() => expect(conversationsApi.events).toHaveBeenCalledWith('live-1'));
    expect(await screen.findByText('Yael Cohen', { selector: 'button *, button' })).toBeInTheDocument();
  });

  it('loads history for the All tab from the conversations API', async () => {
    render(<ConversationsScreen />);
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(await screen.findByText('0501112222', { exact: false })).toBeTruthy();
    expect(conversationsApi.list).toHaveBeenCalledWith({ tab: 'all' });
  });

  it('posts a note from the composer', async () => {
    render(<ConversationsScreen />);
    fireEvent.click(await screen.findByTestId('session-row'));
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Call back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(conversationsApi.addNote).toHaveBeenCalledWith('live-1', 'Call back'));
  });

  it('patches a contact field inline', async () => {
    phoneCall = { id: 'live-1', state: 'active', remote: '0525550144' };
    render(<ConversationsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Email' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'y@x.io' } });
    fireEvent.keyDown(screen.getByLabelText('Email'), { key: 'Enter' });
    await waitFor(() => expect(contactsApi.update).toHaveBeenCalledWith('ct-1', { field: 'email', value: 'y@x.io' }));
  });

  it('renders only the panes the ACL grants', async () => {
    granted = ['calls'];
    render(<ConversationsScreen />);
    fireEvent.click(await screen.findByTestId('session-row'));
    await screen.findByText('Answered by Dana');
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByTestId('contact-panel')).toBeNull();
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
  });

  it('shows no list or thread without calls', () => {
    granted = [];
    render(<ConversationsScreen />);
    expect(screen.queryByTestId('session-row')).toBeNull();
    expect(screen.getByText('Your access does not include conversations.')).toBeInTheDocument();
  });
});
