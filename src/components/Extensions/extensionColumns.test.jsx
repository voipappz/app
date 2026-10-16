import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { buildExtensionColumns } from './extensionColumns';
import ResponsiveTable from '../shared/ResponsiveTable/ResponsiveTable';
import { pretendPhoneScreen } from '../../test/phoneScreen';
import { widthNeeded } from '../../test/tableWidth';
import { formatDate } from '../../utils/dateUtils';

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

  it('fit every column, Application and Tags included, in a 1280px desktop', () => {
    const columns = columnsIn();
    render(<ResponsiveTable columns={columns} rows={[device]} getRowId={(row) => row.uuid} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length);
    expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeInTheDocument();
    expect(widthNeeded(screen.getByRole('table'), columns)).toBeLessThanOrEqual(1280);
  });

  it('fix a narrow width only on the icon and chip columns and let the text ones flex', () => {
    expect(columnsIn().filter((column) => column.width).map((column) => column.id)).toEqual(['registration', 'enabled']);
  });

  it('show the dates on one line in the small secondary type, and a small Enabled chip', () => {
    render(<ResponsiveTable columns={columnsIn()} rows={[device]} getRowId={(row) => row.uuid} />);
    expect(screen.getByText(formatDate(device.created_at)).tagName).toBe('SPAN');
    expect(screen.getByText('Yes').closest('.MuiChip-root')).toHaveClass('MuiChip-sizeSmall');
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
