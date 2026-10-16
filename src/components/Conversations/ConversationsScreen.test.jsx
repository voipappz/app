import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ConversationsScreen from './ConversationsScreen.jsx';
import { createMockApis, liveRowsDoc } from './fixtures';

const h = vi.hoisted(() => ({ granted: [], call: null, apis: null }));
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: (k, a) => h.granted.includes(a && a !== 'read' ? `${k}:${a}` : k) }) }));
vi.mock('../../context/SoftphoneContext', () => ({ useSoftphone: () => ({ call: h.call }) }));
vi.mock('../LiveDashboard/useLiveEnvironment', () => ({ useLiveEnvironment: () => ({ uuid: 'env-1' }) }));
vi.mock('../../hooks/useLiveEntities', () => ({ default: () => ({ connected: true, byScope: (s) => (s === 'environment' ? [liveRowsDoc] : []), rows: [] }) }));
vi.mock('../Phone/PhoneScreen.jsx', () => ({ default: () => <div data-testid="phone-screen" /> }));
vi.mock('../../services/cable', () => ({ getConsumer: () => null }));
vi.mock('../../services/api/conversationsApi', () => {
  const m = { MOCK_CONVERSATIONS: false };
  ['listConversations', 'getConversation', 'getEvents', 'addNote', 'lookupContact', 'getContact', 'createContact', 'updateContact', 'listFields', 'createField'].forEach((n) => { m[n] = (...a) => h.apis[n](...a); });
  return m;
});

beforeEach(() => {
  h.granted = ['calls', 'notes:write', 'contact'];
  h.call = null;
  h.apis = createMockApis();
  try { localStorage.clear(); } catch { /* none */ }
});

describe('Conversations screen (mock data)', () => {
  it('loads saved history immediately and switches to Missed', async () => {
    render(<ConversationsScreen />);
    expect(await screen.findAllByTestId('session-row')).toHaveLength(5);
    expect(screen.queryByRole('tab', { name: 'Live' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    await screen.findByText('Dan Levi');
    expect(screen.getAllByTestId('session-row').length).toBe(5);
    fireEvent.click(screen.getByRole('tab', { name: 'Missed' }));
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(1));
    expect(screen.getByText('Noa Bar')).toBeInTheDocument();
  });

  it('searches saved history by number', async () => {
    const spy = vi.spyOn(h.apis, 'listConversations');
    render(<ConversationsScreen />);
    await screen.findAllByTestId('session-row');
    fireEvent.change(screen.getByLabelText('Search by number'), { target: { value: '0525550177' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tab: 'all', q: '0525550177' })), { timeout: 2000 });
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(1));
  });

  it('shows the call summary of a finished conversation with a recording link', async () => {
    render(<ConversationsScreen />);
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.click(await screen.findByText('Dan Levi'));
    const summary = await screen.findByTestId('call-summary');
    expect(summary).toHaveTextContent('Dana Levi');
    expect(summary).toHaveTextContent('04:25');
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute('href', expect.stringContaining('c-ended.mp3'));
  });

  it('labels bot conversations with a Bot chip', async () => {
    render(<ConversationsScreen />);
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(await screen.findByText('Bot')).toBeInTheDocument();
  });

  it('sorts oldest first through the menu and remembers it', async () => {
    render(<ConversationsScreen />);
    const spy = vi.spyOn(h.apis, 'listConversations');
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Oldest first' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ orderBy: 'started_at', orderKind: 'asc' })));
    expect(JSON.parse(localStorage.getItem('conversations-view')).sort).toBe('oldest');
  });

  it('offers Everyone only with the call environment permission and then sends scope', async () => {
    render(<ConversationsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    expect(screen.queryByRole('menuitem', { name: 'Everyone' })).toBeNull();
  });

  it('sends scope=environment when Everyone is chosen', async () => {
    h.granted = [...h.granted, 'call:environment'];
    render(<ConversationsScreen />);
    const spy = vi.spyOn(h.apis, 'listConversations');
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Everyone' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ scope: 'environment' })));
  });

  it('shows the thread of the selected session with its note card', async () => {
    render(<ConversationsScreen />);
    fireEvent.click((await screen.findAllByTestId('session-row'))[1]);
    expect(await screen.findByText('Answered by Dana')).toBeInTheDocument();
    expect(screen.getByTestId('event-note')).toHaveTextContent('Wants the annual plan');
    expect(screen.getAllByTestId('session-row')[1]).toHaveAttribute('aria-current', 'true');
  });

  it('adds a note and appends it to the thread', async () => {
    render(<ConversationsScreen />);
    fireEvent.click((await screen.findAllByTestId('session-row'))[1]);
    fireEvent.change(await screen.findByLabelText('Note'), { target: { value: 'Call back Sunday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Call back Sunday')).toBeInTheDocument();
  });

  it('does not replace history selection with the active phone call', async () => {
    h.call = { id: 'c-live', state: 'active', remote: '0525550144' };
    render(<ConversationsScreen />);
    await screen.findAllByTestId('session-row');
    expect(screen.getByText('Select a conversation.')).toBeInTheDocument();
    expect(screen.queryByText('Answered by Dana')).toBeNull();
  });

  it('hides the composer without note write access', async () => {
    h.granted = ['calls'];
    render(<ConversationsScreen />);
    fireEvent.click((await screen.findAllByTestId('session-row'))[1]);
    await screen.findByText('Answered by Dana');
    expect(screen.queryByLabelText('Note')).toBeNull();
    expect(screen.queryByTestId('contact-panel')).toBeNull();
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
  });

  it('hides the list and thread without calls but keeps the phone', () => {
    h.granted = ['contact'];
    render(<ConversationsScreen />);
    expect(screen.queryByTestId('session-row')).toBeNull();
    expect(screen.getByText('Your access does not include conversations.')).toBeInTheDocument();
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
  });

  it('keeps only conversations and the phone even with contact access', async () => {
    render(<ConversationsScreen />);
    fireEvent.click((await screen.findAllByTestId('session-row'))[1]);
    await screen.findByText('Answered by Dana');
    expect(screen.queryByTestId('contact-panel')).toBeNull();
    expect(screen.getByTestId('phone-screen')).toBeInTheDocument();
  });
});
