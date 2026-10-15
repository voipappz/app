import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtensionBridge } from './ExtensionBridge';
import { pretendPhoneScreen } from '../../../test/phoneScreen';

const mockSendLogin = vi.fn();
vi.mock('../../../services/api/extensionsApi', () => ({ extensionsApi: { sendLogin: (...a) => mockSendLogin(...a) } }));
vi.mock('../../common/DynamicProfileEditor/DynamicProfileEditor', () => ({ default: () => null }));
vi.mock('../../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));

const device = { uuid: 'dev-uuid-1', username: '1010', name: 'Front desk', environment_uuid: 'env-1' };
const show = () => render(<ExtensionBridge open mode="edit" extension={device} containerMode="panel" onClose={() => {}} onSave={() => {}} />);

let backToDesktop = () => {};
afterEach(() => { backToDesktop(); backToDesktop = () => {}; });

describe('editing a device', () => {
  it('shows its UUID on a desktop', () => {
    show();
    expect(screen.getByDisplayValue('dev-uuid-1')).toBeInTheDocument();
  });

  it('leaves the UUID out on a phone', () => {
    backToDesktop = pretendPhoneScreen();
    show();
    expect(screen.queryByDisplayValue('dev-uuid-1')).toBeNull();
  });
});

describe('the device password is never shown', () => {
  it('starts blank in edit mode, even if a password were passed in', () => {
    render(<ExtensionBridge open mode="edit" extension={{ ...device, password: 'Leaked-Secret' }} containerMode="panel" onClose={() => {}} onSave={() => {}} />);
    expect(screen.queryByDisplayValue('Leaked-Secret')).toBeNull();
  });

  it('emails the SIP login to the admin on request and says where it went', async () => {
    mockSendLogin.mockResolvedValueOnce({ sent_to: 'admin@example.com' });
    show();
    fireEvent.click(screen.getByTestId('device-email-login'));
    expect(mockSendLogin).toHaveBeenCalledWith('dev-uuid-1');
    expect(await screen.findByText(/admin@example\.com/)).toBeInTheDocument();
  });

  it('says so when the email could not be sent', async () => {
    mockSendLogin.mockRejectedValueOnce(new Error('boom'));
    show();
    fireEvent.click(screen.getByTestId('device-email-login'));
    expect(await screen.findByText(/could not send/i)).toBeInTheDocument();
  });
});
