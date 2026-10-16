import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '../../i18n';
import ConversationsScreen from './ConversationsScreen.jsx';
import { createMockApis, liveRowsDoc } from './fixtures';

const h = vi.hoisted(() => ({ granted: [], call: null, apis: null }));
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: (k) => h.granted.includes(k) }) }));
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ call: h.call }) }));
vi.mock('../LiveDashboard/useLiveEnvironment', () => ({ useLiveEnvironment: () => ({ uuid: 'env-1' }) }));
vi.mock('../../hooks/useLiveEntities', () => ({ default: () => ({ connected: true, byScope: () => [liveRowsDoc] }) }));
vi.mock('../Phone/PhoneScreen.jsx', () => ({ default: () => <div data-testid="phone-screen" /> }));
vi.mock('../../services/api/conversationsApi', () => ({ MOCK_CONVERSATIONS: false, conversationsApi: { list: (a) => h.apis.conversationsApi.list(a), events: (a) => h.apis.conversationsApi.events(a), addNote: (a, b) => h.apis.conversationsApi.addNote(a, b) } }));
vi.mock('../../services/api/contactsApi', () => ({ contactsApi: { lookup: (a) => h.apis.contactsApi.lookup(a), get: (a) => h.apis.contactsApi.get(a), fields: () => h.apis.contactsApi.fields(), update: (a, b) => h.apis.contactsApi.update(a, b), create: (a) => h.apis.contactsApi.create(a) } }));
vi.mock('../../services/api/messagesApi', () => ({ messagesApi: { send: vi.fn(async () => ({})) } }));

beforeEach(() => {
  h.granted = ['calls', 'notes', 'messages', 'contacts'];
  h.call = null;
  h.apis = createMockApis();
});

describe('Conversations screen (mock data)', () => {
  it('lists the two live calls first and switches to All and Missed', async () => {
    render(<ConversationsScreen />);
    expect(await screen.findAllByTestId('session-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    await screen.findByText('Dan Levi');
    expect(screen.getAllByTestId('session-row').length).toBe(4);
    fireEvent.click(screen.getByRole('tab', { name: 'Missed' }));
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(1));
    expect(screen.getByText('Noa Bar')).toBeInTheDocument();
  });

  it('shows the thread of the selected session with its note card', async () => {
    render(<ConversationsScreen />);
    fireEvent.click((await screen.findAllByTestId('session-row'))[1]);
    expect(await screen.findByText('Answered by Dana')).toBeInTheDocument();
    expect(screen.getByTestId('event-note')).toHaveTextContent('Wants the annual plan');
    expect(screen.getByTestId('event-sms')).toBeInTheDocument();
    expect(screen.getAllByTestId('session-row')[1]).toHaveAttribute('aria-current', 'true');
  });

  it('adds a note and appends it to the thread', async () => {
    render(<ConversationsScreen />);
    fireEvent.click((await screen.findAllByTestId('session-row'))[1]);
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Call back Sunday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Call back Sunday')).toBeInTheDocument();
  });

  it("selects the phone call's conversation", async () => {
    h.call = { id: 'c-live', state: 'active', remote: '0525550144' };
    render(<ConversationsScreen />);
    expect(await screen.findByText('Answered by Dana')).toBeInTheDocument();
  });

  it('hides the composer without notes and messages, the contact without contacts', async () => {
    h.granted = ['calls'];
    render(<ConversationsScreen />);
    fireEvent.click((await screen.findAllByTestId('session-row'))[1]);
    await screen.findByText('Answered by Dana');
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByTestId('contact-panel')).toBeNull();
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
  });

  it('hides the list and thread without calls but keeps the phone', () => {
    h.granted = ['contacts'];
    render(<ConversationsScreen />);
    expect(screen.queryByTestId('session-row')).toBeNull();
    expect(screen.getByText('Your access does not include conversations.')).toBeInTheDocument();
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
  });

  it('shows the contact panel for the selected number', async () => {
    h.call = { id: 'c-live', state: 'active', remote: '0525550144' };
    render(<ConversationsScreen />);
    const panel = await screen.findByTestId('contact-panel');
    expect(await within(panel).findByText('Cohen Ltd')).toBeInTheDocument();
  });
});
