import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pretendPhoneScreen } from '../../../test/phoneScreen';
import { liveApi } from '../../../services/api/liveApi';
import LiveCallsPanel from './LiveCallsPanel';

const CALLS = [
  { uuid: 'call-1', cid_name: 'Noam', cid_num: '0501234567', dest: '211', direction: 'inbound', callstate: 'ACTIVE', application: 'bridge' },
];
const COLUMNS = ['cid_name', 'cid_num', 'dest', 'direction', 'callstate', 'application']
  .map((field) => ({ field, headerName: field, width: 120 }));

vi.mock('../useLiveCalls', () => ({
  useLiveCalls: () => ({
    calls: CALLS, columns: COLUMNS, loading: false, error: null, isNodeError: false, totalCount: CALLS.length, refresh: vi.fn(),
  }),
}));
vi.mock('../../../services/api/liveApi', () => ({
  liveApi: { spyCall: vi.fn(() => Promise.resolve()), hangupCall: vi.fn(() => Promise.resolve()), callAction: vi.fn(() => Promise.resolve()) },
}));
vi.mock('../../../context/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));
vi.mock('../LiveChartStrip', () => ({ default: () => null }));
// The ACL grants, as `screen:action` (usePermissions' `can`).
let grants = [];
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (screen, action = 'read') => grants.includes(`${screen}:${action}`) }),
}));
// The data grid sizes itself from the layout, which jsdom does not have: a
// plain table with the same columns stands in for it.
vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows, columns, getRowId, onRowClick }) => (
    <table><tbody>
      {rows.map((row) => (
        <tr key={getRowId(row)} onClick={() => onRowClick?.({ row })}>
          {columns.map((column) => <td key={column.field}>{column.renderCell ? column.renderCell({ row }) : row[column.field]}</td>)}
        </tr>
      ))}
    </tbody></table>
  ),
}));

let backToDesktop = null;
beforeEach(() => { grants = ['calls:read']; vi.clearAllMocks(); });
afterEach(() => { backToDesktop?.(); backToDesktop = null; });

describe('LiveCallsPanel', () => {
  it('offers the call actions to whoever the ACL lets change calls', async () => {
    grants = ['calls:read', 'calls:write'];
    render(<LiveCallsPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Listen' }));
    expect(liveApi.spyCall).toHaveBeenCalledWith('call-1', 'listen');
  });

  it('shows the calls without actions to someone who may only read them', () => {
    render(<LiveCallsPanel />);
    expect(screen.getByText('Noam')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Listen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hangup' })).not.toBeInTheDocument();
  });
});

describe('LiveCallsPanel on a phone', () => {
  it('shows a call as a card with finger-sized actions', async () => {
    backToDesktop = pretendPhoneScreen();
    grants = ['calls:read', 'calls:write'];
    render(<LiveCallsPanel />);
    const card = screen.getByTestId('mobile-record-card');
    expect(within(card).getByText('Noam')).toBeInTheDocument();
    expect(within(card).getByText('211')).toBeInTheDocument();
    const hangup = within(card).getByRole('button', { name: 'Hangup' });
    expect(hangup).toHaveClass('MuiIconButton-sizeMedium');
    await userEvent.click(hangup);
    expect(liveApi.hangupCall).toHaveBeenCalledWith('call-1');
    // An action is not a tap on the card: no details open.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a tapped call in a full-screen dialog', async () => {
    backToDesktop = pretendPhoneScreen();
    render(<LiveCallsPanel />);
    await userEvent.click(screen.getByTestId('mobile-record-card'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Call Detail')).toBeInTheDocument();
    expect(within(dialog).getByText('bridge')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close call detail' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
