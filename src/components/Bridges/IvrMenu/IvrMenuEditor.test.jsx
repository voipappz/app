import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from '../../../i18n';
import IvrMenuEditor from './IvrMenuEditor';
import { ivrApi } from '../../../services/api/ivrApi';

// The routes write grant (usePermissions' canWriteDestinations).
let routesWrite = true;
vi.mock('../../../hooks/usePermissions', () => ({ usePermissions: () => ({ canWriteDestinations: routesWrite }) }));
vi.mock('../../common/AudioPreview/AudioPreview.jsx', () => ({ default: ({ uuid }) => <span>player {uuid}</span> }));
vi.mock('../NumberBridge/NumberSelector.jsx', () => ({
  NumberSelector: ({ label, onChange }) => <button type="button" onClick={() => onChange('route-1')}>{label} box</button>,
}));
vi.mock('../../../services/api/ivrApi', () => ({
  ivrApi: { getIVR: vi.fn(), createIVR: vi.fn(), updateIVR: vi.fn() },
}));
const ITEMS = {
  announcement: [{ uuid: 'ann-1', name: 'Welcome' }],
  queue: [{ uuid: 'q-1', name: 'Sales team' }],
  vml: [{ uuid: 'vml-1', name: 'Office voicemail' }],
  extension: [{ uuid: 'ext-200', name: 'Operator' }],
};
// What GET /api/assets/bridge_types answers this user.
let offered = [];
vi.mock('../../../services/api/bridgeApi', () => ({
  bridgeApi: {
    getBridgeResources: vi.fn((type) => Promise.resolve(ITEMS[type] || [])),
    getBridgeTypes: vi.fn(() => Promise.resolve(offered)),
  },
}));

const saved = {
  uuid: 'ivr-1', name: 'Main menu', environment_uuid: 'env-1', announcement_uuid: 'ann-1',
  timeout: 5, timeout_bridge_type: 'vml', timeout_bridge_uuid: 'vml-1',
  invalid: 3, invalid_bridge_type: 'extension', invalid_bridge_uuid: 'ext-200',
  entries: { 1: { name: 'Sales', bridge_type: 'queue', bridge_uuid: 'q-1' } },
};

beforeEach(() => {
  routesWrite = true;
  ITEMS.queue = [{ uuid: 'q-1', name: 'Sales team' }];
  offered = ['extension', 'queue', 'ivr', 'announcement', 'call_condition', 'vml', 'conference', 'number'];
  vi.clearAllMocks();
  ivrApi.getIVR.mockResolvedValue({ data: saved });
  ivrApi.updateIVR.mockResolvedValue({ data: saved });
  ivrApi.createIVR.mockResolvedValue({ data: { uuid: 'ivr-new' } });
});
afterEach(async () => { await i18n.changeLanguage('en'); vi.unstubAllGlobals(); });

const renderEditor = (props = {}) => {
  const handlers = { onSave: vi.fn(), onClose: vi.fn(), onDrillDown: vi.fn() };
  render(<IvrMenuEditor mode="edit" ivr={{ uuid: 'ivr-1' }} environmentUuid="env-1" {...handlers} {...props} />);
  return handlers;
};
const loaded = () => screen.findByRole('button', { name: 'Key 1: Sales' });
const dialog = () => screen.getByRole('dialog');
// Opens a MUI Select by its label and picks an option.
const choose = async (scope, label, option) => {
  fireEvent.mouseDown(within(scope).getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

describe('IvrMenuEditor', () => {
  it('shows the menu on a keypad, with a line for each key in use', async () => {
    renderEditor();
    await loaded();
    expect(screen.getByRole('button', { name: 'Key 4, not set' })).toBeInTheDocument();
    expect(await screen.findByText('Queue · Sales team')).toBeInTheDocument();
    expect(screen.getByText('player ann-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Seconds')).toHaveValue(5);
    expect(await screen.findByText('Office voicemail')).toBeInTheDocument();
  });

  it('sets up a free key in its dialog', async () => {
    renderEditor();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Key 2, not set' }));
    expect(screen.getByRole('dialog', { name: 'Option for key 2' })).toBeInTheDocument();
    await choose(dialog(), 'Type', 'Queue');
    await choose(dialog(), 'Destination', 'Sales team');
    // The option is named after the place it goes to, until renamed.
    expect(within(dialog()).getByLabelText('Option name')).toHaveValue('Sales team');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Key 2: Sales team' })).toBeInTheDocument();
  });

  it('asks before deleting an option', async () => {
    const ask = vi.fn(() => false);
    vi.stubGlobal('confirm', ask);
    renderEditor();
    fireEvent.click(await loaded());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete option' }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    // Said no: the key's dialog stays open, with the option as it was.
    expect(within(screen.getByRole('dialog', { name: 'Key 1' })).getByLabelText('Option name')).toHaveValue('Sales');

    ask.mockReturnValue(true);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete option' }));
    expect(await screen.findByRole('button', { name: 'Key 1, not set' })).toBeInTheDocument();
  });

  it('saves the waits as typed', async () => {
    const { onSave } = renderEditor();
    await loaded();
    fireEvent.change(screen.getByLabelText('Seconds'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Wrong keys allowed'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save phone menu' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(ivrApi.updateIVR).toHaveBeenCalledWith('ivr-1', expect.objectContaining({ timeout: 6, invalid: 2 }));
  });

  it('asks for a phone number when a fallback goes to one', async () => {
    const { onSave } = renderEditor();
    await loaded();
    const wrongKeyType = screen.getAllByRole('combobox', { name: 'Type' })[1];
    fireEvent.mouseDown(wrongKeyType);
    fireEvent.click(await screen.findByRole('option', { name: 'Phone number' }));
    fireEvent.click(screen.getByRole('button', { name: 'Destination box' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save phone menu' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(ivrApi.updateIVR).toHaveBeenCalledWith('ivr-1', expect.objectContaining({
      invalid_bridge_type: 'number', invalid_bridge_uuid: 'route-1',
    }));
  });

  it('shows what is missing next to it, and saves nothing', async () => {
    renderEditor({ mode: 'create', ivr: null });
    fireEvent.change(screen.getByLabelText('Seconds'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save phone menu' }));
    expect(await screen.findByText('Give the menu a name')).toBeInTheDocument();
    expect(screen.getByText('Choose what callers hear first')).toBeInTheDocument();
    expect(screen.getByText('Between 1 and 300 seconds')).toBeInTheDocument();
    expect(screen.getAllByText('Choose where to send the caller')).toHaveLength(2);
    expect(ivrApi.createIVR).not.toHaveBeenCalled();
  });

  it('offers the destinations the server allows this person', async () => {
    offered = ['queue', 'extension'];
    renderEditor();
    fireEvent.click(await loaded());
    fireEvent.mouseDown(within(dialog()).getByRole('combobox', { name: 'Type' }));
    const types = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(types).toEqual(['Device', 'Queue']);
  });

  it('makes a new one only with the routes write grant', async () => {
    routesWrite = false;
    renderEditor();
    fireEvent.click(await loaded());
    await within(dialog()).findByText('Sales team');
    expect(within(dialog()).queryByRole('button', { name: 'New Queue' })).toBeNull();
  });

  it('makes a new queue in the route wizard and comes back to the same key', async () => {
    const { onDrillDown } = renderEditor();
    fireEvent.click(await loaded());
    fireEvent.change(within(dialog()).getByLabelText('Option name'), { target: { value: 'Night line' } });
    fireEvent.click(await within(dialog()).findByRole('button', { name: 'New Queue' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDrillDown).toHaveBeenCalledWith(expect.objectContaining({ type: 'queue', mode: 'create', environmentUuid: 'env-1' }));

    ITEMS.queue = [...ITEMS.queue, { uuid: 'q-2', name: 'Night team' }];
    await onDrillDown.mock.calls[0][0].onResult({ uuid: 'q-2' });
    const back = await screen.findByRole('dialog', { name: 'Key 1' });
    expect(within(back).getByLabelText('Option name')).toHaveValue('Night line');
    expect(await within(back).findByText('Night team')).toBeInTheDocument();
  });

  it('keeps what was typed when the wizard step is cancelled', async () => {
    const { onDrillDown } = renderEditor();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Key 3, not set' }));
    fireEvent.change(within(dialog()).getByLabelText('Option name'), { target: { value: 'Billing' } });
    await choose(dialog(), 'Type', 'Queue');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'New Queue' }));
    expect(onDrillDown).toHaveBeenCalled();
    // Cancelled: the wizard comes back without calling onResult.
    expect(screen.getByRole('button', { name: 'Key 3: Billing' })).toBeInTheDocument();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    renderEditor();
    expect(await screen.findByRole('button', { name: 'שמירת התפריט' })).toBeInTheDocument();
    expect(screen.getByText('אם לא נלחץ מקש')).toBeInTheDocument();
  });
});
