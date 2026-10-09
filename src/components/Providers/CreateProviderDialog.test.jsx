import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateProviderDialog from './CreateProviderDialog';

const providerTypes = [
  { value: 'sip', label: 'SIP Provider', fields: [
    { key: 'address', label: 'Carrier address', required: true },
    { key: 'port', label: 'Port', type: 'number', default: 5060 },
  ] },
  { value: 'did', label: 'DID', fields: [] },
  { value: 'webhook', label: 'Webhook', fields: [] },
];

describe('single-form provider creation', () => {
  it('shows DID from the server and excludes Webhook from the choices', async () => {
    const user = userEvent.setup();
    render(<CreateProviderDialog open onClose={vi.fn()} onSave={vi.fn()} providerTypes={providerTypes} />);
    await user.click(screen.getByRole('combobox', { name: /Provider type/ }));
    expect(screen.getByRole('option', { name: 'DID' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Webhook' })).toBeNull();
    await user.click(screen.getByRole('option', { name: 'DID' }));
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('validates server-required fields and sends their values under profile', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue({});
    render(<CreateProviderDialog open onClose={vi.fn()} onSave={save} providerTypes={providerTypes} />);
    await user.click(screen.getByRole('combobox', { name: /Provider type/ }));
    await user.click(screen.getByRole('option', { name: 'SIP Provider' }));
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Carrier');
    await user.click(screen.getByRole('button', { name: 'Create Provider' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Carrier address is required')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: /Carrier address/ }), '192.0.2.10');
    await user.click(screen.getByRole('button', { name: 'Create Provider' }));
    expect(save).toHaveBeenCalledWith({
      name: 'Carrier', type: 'sip', notes: '', profile: { address: '192.0.2.10', port: 5060 },
    });
  });

  it('keeps entered values and displays profile validation errors from the API', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValue({ response: { data: { message: 'profile.address must be a valid IP address or CIDR' } } });
    render(<CreateProviderDialog open onClose={vi.fn()} onSave={save} providerTypes={providerTypes} />);
    await user.click(screen.getByRole('combobox', { name: /Provider type/ }));
    await user.click(screen.getByRole('option', { name: 'SIP Provider' }));
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Carrier');
    await user.type(screen.getByRole('textbox', { name: /Carrier address/ }), 'bad host');
    await user.click(screen.getByRole('button', { name: 'Create Provider' }));
    expect(await screen.findByText('profile.address must be a valid IP address or CIDR')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Carrier address/ }).value).toBe('bad host');
  });
});
