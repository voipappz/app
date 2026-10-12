import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExtensionBridge } from './ExtensionBridge';
import { pretendPhoneScreen } from '../../../test/phoneScreen';

vi.mock('../../../services/api/extensionsApi', () => ({ extensionsApi: {} }));
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
