import { render, screen, fireEvent, within } from '@testing-library/react';
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
vi.mock('../../../services/api/templatesApi', () => ({ templatesApi: {} }));
vi.mock('../../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));
const scope = { selectedEnvironments: [{ uuid: 'env-1', name: 'Sales' }] };
vi.mock('../../../context/CustomerEnvironmentContext', () => ({ useCustomerEnvironment: () => scope }));

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
