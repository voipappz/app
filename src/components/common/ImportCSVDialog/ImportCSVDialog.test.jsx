import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ImportCSVDialog from './ImportCSVDialog';
import {
  DEVICE_CSV_HEADERS, deviceErrors, deviceRowErrors, generateDevicePassword, prepareDeviceRow, randomDeviceRows,
} from '../../Bridges/ExtensionBridge/deviceRules';

const environments = [{ uuid: 'env-1', name: 'Sales' }];

function renderDialog(props) {
  // The dialog reads breakpoints (full screen on a phone), so it needs a theme.
  return render(
    <ThemeProvider theme={createTheme()}>
    <ImportCSVDialog open onClose={vi.fn()} title="Import Devices from CSV" entityName="Devices"
      environments={environments} selectedEnvironment="env-1" showTemplateOption
      templateHeaders={DEVICE_CSV_HEADERS} validateRow={deviceRowErrors} prepareRow={prepareDeviceRow} {...props} />
    </ThemeProvider>,
  );
}

describe('device rules', () => {
  it('are the device form rules', () => {
    expect(deviceErrors({ name: '', username: ' ', password: '' })).toEqual({
      name: 'Name is required', username: 'Device number is required', password: 'Password is required for new devices',
    });
    expect(deviceErrors({ name: 'Eli', username: '801' }, { requirePassword: false })).toEqual({});
  });

  it('generate passwords and random examples', () => {
    expect(generateDevicePassword()).toMatch(/^[A-Za-z0-9]{12}$/);
    const rows = randomDeviceRows(3);
    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(deviceRowErrors(row)).toEqual({}));
    expect(Number(rows[1].Username)).toBe(Number(rows[0].Username) + 1);
    expect(prepareDeviceRow({ Username: '1', Name: 'A', Password: '' }).Password).toHaveLength(12);
  });
});

describe('ImportCSVDialog with row rules', () => {
  it('marks a row that breaks the rules and holds Import', async () => {
    const user = userEvent.setup();
    renderDialog({ onImport: vi.fn(), templateData: [{ Username: '801', Name: '', Password: 'x', CallerID: '' }] });

    await user.click(screen.getByRole('button', { name: /Use Template/ }));
    expect(screen.getByTestId('bad-rows')).toHaveTextContent('1 row needs fixing');
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('shows the rows the server refused, and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onImport = vi.fn().mockResolvedValue({
      added: [{ line: 2, username: '804' }], existing: [],
      failed: [{ line: 3, username: '805', error: 'switch unreachable' }], message: '1 added, 1 failed',
    });
    renderDialog({ onImport, onSuccess, templateData: [
      { Username: '804', Name: 'Maya', Password: '', CallerID: '' },
      { Username: '805', Name: 'Yoni', Password: 'abc', CallerID: '' },
    ] });

    await user.click(screen.getByRole('button', { name: /Use Template/ }));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    const [file, environmentUuid] = onImport.mock.calls[0];
    expect(environmentUuid).toBe('env-1');
    const sent = await file.text();
    expect(sent.split('\n')[0].trim()).toBe('Username,Name,Password,CallerID');
    // The blank password was filled before sending.
    expect(sent.split('\n')[1]).toMatch(/^804,Maya,[A-Za-z0-9]{12},/);
    expect(onSuccess).toHaveBeenCalled();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Line 3 \(805\): switch unreachable/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
