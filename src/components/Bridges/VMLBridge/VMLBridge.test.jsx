import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Z } from '../../../utils/zIndex.js';

// The dialog is rendered for real; the editor, the chat and the data around it
// are stubbed so its own menus are what is under test.
// Stubs return the SAME objects on every render: the dialog reloads its form
// when these change, so fresh ones each render would re-render it forever.
const vml = {
  vmlTypes: ['eval', 'webhook'], loadingTypes: false, vmlContent: '', setVMLContent: vi.fn(),
  metaFields: [], setMetaFields: vi.fn(), addMetaField: vi.fn(), removeMetaField: vi.fn(), updateMetaField: vi.fn(),
  validateMetaFields: () => true, availableVariables: [], insertVariable: vi.fn(),
  loading: false, error: null, clearError: vi.fn(), saveVML: vi.fn(), reset: vi.fn(),
};
vi.mock('./VMLBridge.js', () => ({ useVML: () => vml }));
const chat = {
  messages: [], inputValue: '', setInputValue: vi.fn(), isStreaming: false, error: null, sessionId: null,
  sessions: [], isLoadingSessions: false, loadSession: vi.fn(), deleteSession: vi.fn(), sendMessage: vi.fn(),
  cancelRequest: vi.fn(), clearChat: vi.fn(), fetchSessions: vi.fn(), getLastAgentCode: () => '',
};
vi.mock('./useVMLChat.js', () => ({ useVMLChat: () => chat }));
vi.mock('./CodeEditor.jsx', () => ({ CodeEditor: () => null }));
vi.mock('../shared/MetaPropertiesEditor.jsx', () => ({ MetaPropertiesEditor: () => null }));
vi.mock('../../Templates/Templates.jsx', () => ({ TemplateDialog: () => null }));
vi.mock('../../Templates/Templates.js', () => ({ TEMPLATE_TYPES: [] }));
const templatesApi = vi.hoisted(() => ({ getVmlTemplate: vi.fn() }));
vi.mock('../../../services/api/templatesApi', () => ({ templatesApi }));
vi.mock('../../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));
const scope = { selectedEnvironments: [{ uuid: 'env-1', name: 'Sales' }] };
vi.mock('../../../context/CustomerEnvironmentContext', () => ({ useCustomerEnvironment: () => scope }));

const vmlsApi = vi.hoisted(() => ({ getVML: vi.fn(), updateVML: vi.fn() }));
vi.mock('../../../services/api/vmlsApi.js', () => vmlsApi);

import { VMLBridge } from './VMLBridge.jsx';

// A menu is only usable when it stacks above the dialog that opened it.
const layerOf = (el) => Number(getComputedStyle(el.closest('.MuiModal-root')).zIndex);

describe('the VML dialog', () => {
  const open = () => render(<VMLBridge open onClose={() => {}} onSave={() => {}} />);

  it('shows the type list above the dialog', () => {
    open();
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    const list = screen.getByRole('listbox');
    expect(within(list).getByText('webhook')).toBeInTheDocument();
    expect(layerOf(list)).toBeGreaterThan(Z.L2.DIALOG);
  });

  it('shows the templates menu above the dialog', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Templates/ }));
    expect(layerOf(screen.getByRole('menu'))).toBeGreaterThan(Z.L2.DIALOG);
  });

  it('shows the snippets menu above the dialog', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Snippets/ }));
    expect(layerOf(screen.getByRole('menu'))).toBeGreaterThan(Z.L2.DIALOG);
  });
});

// Edit loads the VML itself: what a list or a route hands in can be partial or
// old, and saving that would write it back over the real script.
describe('editing a VML', () => {
  const stored = { uuid: 'v1', name: 'my_script', type: 'eval', environment_uuid: 'env-1', enabled: true, notes: '', data: '-- fresh' };
  const edit = () => render(<VMLBridge open mode="edit" vml={{ uuid: 'v1', name: 'stale' }} onClose={() => {}} onSave={() => {}} />);
  const nameField = () => screen.getByRole('textbox', { name: /^Name/ });

  it('loads the VML from the API and saves what it loaded', async () => {
    vml.vmlContent = '-- fresh';
    vmlsApi.getVML.mockResolvedValue(stored);
    vmlsApi.updateVML.mockResolvedValue({ uuid: 'v1' });
    edit();

    await waitFor(() => expect(nameField()).toHaveValue('my_script'));
    expect(vmlsApi.getVML).toHaveBeenCalledWith('v1');
    fireEvent.click(screen.getByRole('button', { name: 'Update VML' }));
    await waitFor(() => expect(vmlsApi.updateVML).toHaveBeenCalledWith('v1', expect.objectContaining({ name: 'my_script', type: 'eval' })));
  });

  it('refuses a name the API would refuse, and shows why a save failed', async () => {
    vml.vmlContent = '-- fresh';
    vmlsApi.getVML.mockResolvedValue(stored);
    vmlsApi.updateVML.mockReset();
    edit();
    await waitFor(() => expect(nameField()).toHaveValue('my_script'));

    fireEvent.change(nameField(), { target: { value: 'My Script' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update VML' }));
    expect(screen.getByText('Use letters, numbers, _ or - only (no spaces)')).toBeInTheDocument();
    expect(vmlsApi.updateVML).not.toHaveBeenCalled();

    fireEvent.change(nameField(), { target: { value: 'my_script' } });
    vmlsApi.updateVML.mockRejectedValue(new Error('name is invalid'));
    fireEvent.click(screen.getByRole('button', { name: 'Update VML' }));
    expect(await screen.findByText('name is invalid')).toBeInTheDocument();
  });
});

// A new VML starts from its type's template and is linked to it.
describe('creating a VML', () => {
  it("fills the editor with the type's template and links it", async () => {
    vml.vmlContent = '';
    vml.setVMLContent.mockClear();
    vml.setMetaFields.mockClear();
    templatesApi.getVmlTemplate.mockResolvedValue({ uuid: 't-bot', type: 'vml_bot', text: '-- openai realtime' });
    render(<VMLBridge open onClose={() => {}} onSave={() => {}} />);

    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('webhook'));

    await waitFor(() => expect(templatesApi.getVmlTemplate).toHaveBeenCalledWith('webhook', 'env-1'));
    await waitFor(() => expect(vml.setVMLContent).toHaveBeenCalledWith('-- openai realtime'));
    const update = vml.setMetaFields.mock.calls.at(-1)[0];
    expect(update([])).toEqual([{ key: 'template_uuid', value: 't-bot' }]);
  });

  it("offers the template's tags, and keeps template_uuid for a type that owns it", async () => {
    vml.vmlContent = '';
    vml.setMetaFields.mockClear();
    templatesApi.getVmlTemplate.mockResolvedValue({ uuid: 't-conf', text: 'local vml = ...', vars: { prompt_enter_pin: 'Prompt', tries: 'Tries' } });
    render(<VMLBridge open onClose={() => {}} onSave={() => {}} />);
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('webhook'));
    await waitFor(() => expect(vml.setMetaFields).toHaveBeenCalled());
    let update = vml.setMetaFields.mock.calls.at(-1)[0];
    expect(update([{ key: 'tries', value: '5' }])).toEqual([
      { key: 'tries', value: '5' },
      { key: 'prompt_enter_pin', value: '' },
      { key: 'template_uuid', value: 't-conf' },
    ]);

    vml.setMetaFields.mockClear();
    templatesApi.getVmlTemplate.mockResolvedValue({ uuid: 't-sms', text: 'local vml = ...', vars: { template_uuid: 'Message template' } });
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('eval'));
    await waitFor(() => expect(vml.setMetaFields).toHaveBeenCalled());
    update = vml.setMetaFields.mock.calls.at(-1)[0];
    expect(update([{ key: 'prompt_enter_pin', value: '' }, { key: 'tries', value: '5' }, { key: 'template_uuid', value: 't-conf' }])).toEqual([
      { key: 'tries', value: '5' },
      { key: 'template_uuid', value: '' },
    ]);
  });

  it('leaves what someone already wrote alone', async () => {
    vml.vmlContent = '-- my own script';
    templatesApi.getVmlTemplate.mockClear();
    render(<VMLBridge open onClose={() => {}} onSave={() => {}} />);
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('webhook'));
    expect(templatesApi.getVmlTemplate).not.toHaveBeenCalled();
    vml.vmlContent = '';
  });
});
