import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// One stable value, as the real context gives: the form's environment effect
// depends on it, and a fresh array per render would loop forever.
vi.mock('../../../context/CustomerEnvironmentContext', () => {
  const ctx = { selectedEnvironments: [{ uuid: 'env-1', name: 'AD HAGAG' }] };
  return { useCustomerEnvironment: () => ctx };
});
vi.mock('../../../services/api/routesApi', () => ({
  didsApi: { getProviders: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('../../../services/api/providersApi', () => ({
  providersApi: {
    getProviders: vi.fn(() => Promise.resolve([{ uuid: 'prov-pbx2', name: 'PBX2' }])),
    createProvider: vi.fn(),
  },
}));
vi.mock('./RoutingChain.jsx', () => ({ default: () => null }));
vi.mock('../../Bridges/NumberBridge/NumberSelector.jsx', () => ({ NumberSelector: () => null }));
let mockUserSession = false;
vi.mock('../../../hooks/useIsUserSession', () => ({ useIsUserSession: () => mockUserSession }));

import DIDForm from './DIDForm.jsx';
import { providersApi } from '../../../services/api/providersApi';

// What GET /api/routes?action=types answers (API Did::TYPES + Did::FEATURES).
const API_TYPES = [
  'src', 'dst', 'feature',
  'feature:user.login', 'feature:user.logout', 'feature:user.available',
  'feature:user.break', 'feature:user.logged_out', 'feature:spy', 'feature:pickup',
  'feature:pickup_extension', 'feature:follow_me', 'feature:follow_me_disable',
  'feature:caller_id_replace', 'feature:trunk',
];
const FEATURE_CODES = API_TYPES.filter(t => t.startsWith('feature:') && t !== 'feature:trunk');

const renderForm = (props = {}) => render(
  <DIDForm didTypes={API_TYPES} bridgeTypes={['extension', 'announcement', 'queue']}
    onSave={vi.fn()} onCancel={vi.fn()} {...props} />,
);

// An existing route, the way the edit screen opens it.
const route = (type, extra = {}) => ({
  uuid: 'did-1', name: 'r', number: type.startsWith('feature:') ? '8' : '+14155551234',
  replace: '', type, environment_uuid: 'env-1', bridge_type: '', bridge_uuid: '', enabled: true, ...extra,
});

const field = (label) => screen.getByLabelText(new RegExp(`^${label}`));
// A MUI Select is not linked to its label (no labelId), so go through the label.
const pick = (label, option) => {
  const control = screen.getByText(label, { selector: 'label' }).closest('.MuiFormControl-root');
  fireEvent.mouseDown(within(control).getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: option }));
};

beforeEach(() => { vi.clearAllMocks(); mockUserSession = false; });

describe('DIDForm', () => {
  it('puts Enabled on top, then asks for the type, in words', () => {
    const { container } = renderForm();
    const labels = [...container.querySelectorAll('label')].map(l => l.textContent.replace(/\s*\*$/, ''));
    expect(labels[0]).toBe('Enabled');
    expect(labels[1]).toBe('Route Type');
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    expect(screen.getByRole('option', { name: 'Trunk – outgoing calls' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Feature – agent log in' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /FEATURE:/ })).not.toBeInTheDocument();
  });

  describe('every type, as the edit screen opens it', () => {
    it.each(['src', 'dst', 'feature'])('%s: a phone number and a bridge', (type) => {
      renderForm({ did: route(type) });
      expect(field('Phone Number')).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Prefix/)).not.toBeInTheDocument();
      expect(screen.getByText('Bridge Type', { selector: 'label' })).toBeInTheDocument();
    });

    it.each(FEATURE_CODES)('%s: a prefix rule and a bridge, no trunk fields', (type) => {
      renderForm({ did: route(type) });
      expect(field('Prefix')).toHaveValue('8');
      expect(field('Replace with')).not.toBeRequired();
      expect(screen.queryByLabelText(/^Phone Number/)).not.toBeInTheDocument();
      expect(screen.getByText('Bridge Type', { selector: 'label' })).toBeInTheDocument();
      expect(screen.queryByText('Send To')).not.toBeInTheDocument();
    });

    it('feature:trunk: a prefix rule and where to send it, no bridge type', () => {
      renderForm({ did: route('feature:trunk') });
      expect(field('Prefix')).toBeInTheDocument();
      expect(screen.getByText('Send To')).toBeInTheDocument();
      expect(screen.queryByText('Bridge Type', { selector: 'label' })).not.toBeInTheDocument();
      expect(screen.getByText(/tariff needs a rate/)).toBeInTheDocument();
    });
  });

  describe('a trunk route', () => {
    it('shows what a dialed number becomes', () => {
      renderForm({ did: route('feature:trunk', { number: '0', replace: '972' }) });
      expect(screen.getByTestId('did-rule-preview')).toHaveTextContent('Dialing 0501234567 sends 972501234567');
      fireEvent.change(field('Replace with'), { target: { value: '' } });
      expect(screen.getByTestId('did-rule-preview')).toHaveTextContent('sends 501234567');
    });

    it('refuses a regex before it reaches the API', async () => {
      const onSave = vi.fn();
      renderForm({ onSave, did: route('feature:trunk', { number: '^8(\\d{4})$', replace: '\\1' }) });
      fireEvent.click(screen.getByRole('button', { name: 'Update Route' }));
      expect(await screen.findByText('Only digits, + * # (a prefix, not a pattern)')).toBeInTheDocument();
      expect(screen.getByText('Only digits, + * #')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('with no provider, sends no bridge: the carrier is chosen by rate', async () => {
      const onSave = vi.fn();
      renderForm({ onSave, did: route('feature:trunk', { number: '0', replace: '972' }) });
      fireEvent.click(screen.getByRole('button', { name: 'Update Route' }));
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave.mock.calls[0][0]).toMatchObject({
        type: 'feature:trunk', number: '0', replace: '972', bridge_type: null, bridge_uuid: null,
      });
    });

    it('with a provider, bridges to it', async () => {
      const onSave = vi.fn();
      renderForm({ onSave, did: route('feature:trunk', { number: '8', bridge_type: 'sip_provider', bridge_uuid: 'prov-pbx2' }) });
      expect(await screen.findByText('PBX2')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Update Route' }));
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave.mock.calls[0][0]).toMatchObject({ bridge_type: 'sip_provider', bridge_uuid: 'prov-pbx2' });
    });

    it('creates a SIP provider in place and selects it', async () => {
      providersApi.createProvider.mockResolvedValue({ uuid: 'prov-new', name: 'Carrier IL' });
      const onSave = vi.fn();
      renderForm({ onSave, did: route('feature:trunk', { number: '0', replace: '972' }) });
      await screen.findByText('Send To');
      pick('Send to', '+ Create New SIP Provider');

      const dialog = screen.getByTestId('sip-provider-quick-create');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(within(dialog).getByText(/Address is required/)).toBeInTheDocument();

      fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Carrier IL' } });
      fireEvent.change(within(dialog).getByLabelText(/^Address/), { target: { value: '10.0.0.9' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(providersApi.createProvider).toHaveBeenCalledWith({
        type: 'sip', name: 'Carrier IL', enabled: true, profile: { address: '10.0.0.9', port: '5060' },
      }));
      await waitFor(() => expect(screen.queryByTestId('sip-provider-quick-create')).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Update Route' }));
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave.mock.calls[0][0]).toMatchObject({ bridge_type: 'sip_provider', bridge_uuid: 'prov-new' });
    });
  });

  it('creating a trunk from scratch: type first, then the rule', async () => {
    const onSave = vi.fn();
    renderForm({ onSave });
    pick('Route Type', 'Trunk – outgoing calls');
    fireEvent.change(field('Name'), { target: { value: 'Israel' } });
    fireEvent.change(field('Prefix'), { target: { value: '0' } });
    fireEvent.change(field('Replace with'), { target: { value: '972' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Route' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: 'feature:trunk', name: 'Israel', number: '0', replace: '972', environment_uuid: 'env-1', bridge_type: null,
    });
  });
});

// A portal user sees only their own environment: the environment
// ("Application") is not a field for them. An account picks it.
describe('DIDForm — the application', () => {
  it('asks an account which application the route belongs to', () => {
    renderForm({ did: route('dst') });
    expect(screen.getByText('Application', { selector: 'label' })).toBeInTheDocument();
  });

  it('does not show a portal user the application at all', () => {
    mockUserSession = true;
    renderForm({ did: route('dst') });
    expect(screen.queryByText('Application', { selector: 'label' })).toBeNull();
    expect(screen.queryByText('The application this Route belongs to')).toBeNull();
  });
});
