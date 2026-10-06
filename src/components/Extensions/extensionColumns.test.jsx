import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { buildExtensionColumns } from './extensionColumns';
import ResponsiveTable from '../shared/ResponsiveTable/ResponsiveTable';
import { pretendPhoneScreen } from '../../test/phoneScreen';

// The events button reads the signed-in session's permissions; not under test here.
vi.mock('../shared/RowEventsButton/RowEventsButton.jsx', () => ({ default: () => null }));

const columnsIn = () => buildExtensionColumns({
  t: i18n.getFixedT(null, 'extensions'),
  registeredUsers: new Set(['1010@pbx.example']),
  canWrite: true,
  canEditEnv: false,
  loading: false,
  actions: {},
});
const textHeaders = (columns) => columns.map((column) => column.label).filter((label) => typeof label === 'string');
const device = { uuid: 'd1', username: '1010@pbx.example', name: 'Front desk', enabled: true, environment: { name: 'Sales' }, created_at: '2026-01-01T10:00:00Z' };

let backToDesktop = () => {};
afterEach(() => { backToDesktop(); return i18n.changeLanguage('en'); });

describe('Extensions columns', () => {
  it('keep the English headers the table always had', () => {
    expect(textHeaders(columnsIn())).toEqual(
      ['Created At', 'Updated At', 'Enabled', 'Device', 'Name', 'Application', 'Tags', 'Actions'],
    );
  });

  it('have Hebrew headers', async () => {
    await i18n.changeLanguage('he');
    expect(textHeaders(columnsIn())).toContain('מכשיר');
  });

  it('show a device as a card on a phone, headed by its SIP username', () => {
    backToDesktop = pretendPhoneScreen();
    render(<ResponsiveTable columns={columnsIn()} rows={[device]} getRowId={(row) => row.uuid} />);
    expect(screen.getByText('1010@pbx.example').tagName).toBe('BDI');
    expect(screen.getByText('Front desk')).toBeInTheDocument();
    expect(screen.getByText('Registration')).toBeInTheDocument();
    expect(screen.getByTestId('phone-extension-button')).toBeInTheDocument();
  });
});
