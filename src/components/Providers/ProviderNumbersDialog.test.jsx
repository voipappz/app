import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProviderNumbersDialog from './ProviderNumbersDialog.jsx';
import { providersApi } from '../../services/api/providersApi';

const access = vi.hoisted(() => ({ write: true }));
vi.mock('../../services/api/providersApi', () => ({ providersApi: {
  testConnection: vi.fn(), searchNumbers: vi.fn(), buyNumber: vi.fn(),
} }));
vi.mock('../../services/api/extensionsApi', () => ({ extensionsApi: {
  getExtensions: vi.fn().mockResolvedValue([{ uuid: 'extension-1', name: 'Reception' }]),
} }));
vi.mock('../../context/CustomerEnvironmentContext', () => ({ useCustomerEnvironment: () => ({
  selectedEnvironments: [{ uuid: 'app-1', name: 'Office' }],
}) }));
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({
  can: () => access.write, canRouteType: () => access.write,
}) }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));

beforeEach(() => {
  vi.clearAllMocks(); access.write = true;
  providersApi.searchNumbers.mockResolvedValue([{ number: '12125550123', setup: '1', monthly: '2', currency: 'USD' }]);
});
const show = () => render(<ProviderNumbersDialog provider={{ uuid: 'provider-1', name: 'Telnyx' }} onClose={vi.fn()} />);

describe('Telnyx number flow', () => {
  it('tests the saved credentials without ordering a number', async () => {
    providersApi.testConnection.mockResolvedValue({ ok: true, balance: '10', currency: 'USD' });
    const user = userEvent.setup(); show();
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(/Connected to Telnyx/)).toBeTruthy();
    expect(providersApi.testConnection).toHaveBeenCalledWith('provider-1');
    expect(providersApi.buyNumber).not.toHaveBeenCalled();
  });

  it('allows read-only searching but disables purchasing', async () => {
    access.write = false;
    const user = userEvent.setup(); show();
    await user.click(screen.getByRole('button', { name: 'Search available numbers' }));
    expect((await screen.findByRole('button', { name: 'Select' })).disabled).toBe(true);
    expect(providersApi.buyNumber).not.toHaveBeenCalled();
  });

  it('requires a destination and explicit confirmation, and blocks a repeat after an ambiguous failure', async () => {
    providersApi.buyNumber.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup(); show();
    await user.click(screen.getByRole('button', { name: 'Search available numbers' }));
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    expect(screen.getByRole('button', { name: /Confirm purchase/ }).disabled).toBe(true);
    await user.click(screen.getByRole('combobox', { name: /Application/ }));
    await user.click(screen.getByRole('option', { name: 'Office' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Route incoming/ }).getAttribute('aria-disabled')).not.toBe('true'));
    await user.click(screen.getByRole('combobox', { name: /Route incoming/ }));
    await user.click(await screen.findByRole('option', { name: 'Reception' }));
    expect(providersApi.buyNumber).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Confirm purchase/ }));
    expect(await screen.findByText(/Check Routes and Telnyx orders/)).toBeTruthy();
    expect(providersApi.buyNumber).toHaveBeenCalledExactlyOnceWith({ provider_uuid: 'provider-1',
      number: '12125550123', environment_uuid: 'app-1', bridge_type: 'extension', bridge_uuid: 'extension-1' });
    expect(screen.getByRole('button', { name: /Confirm purchase/ }).disabled).toBe(true);
  });
});
