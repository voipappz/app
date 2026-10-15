import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Sorting the Accounts table is the SERVER's job: a header click must refetch
// with order_by/order_type and start again at page 1, never reorder the page
// already on screen.

vi.mock('../../services/api/accountsApi', () => ({
  accountsApi: {
    getAccounts: vi.fn(),
    getAcls: vi.fn(),
  },
}));
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));
vi.mock('../../context/CustomerEnvironmentContext', () => ({
  useCustomerEnvironment: () => ({ selectedEnvironments: [], selectedCustomer: null, searchEnvironments: vi.fn() }),
}));
vi.mock('../../context/GlobalSearchContext', () => ({
  useGlobalSearch: () => ({ registerScreen: vi.fn(), unregisterScreen: vi.fn() }),
}));
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));
vi.mock('../../hooks/useAclEdit', () => ({
  default: () => ({ handleAclEdit: vi.fn(), handleAclSave: vi.fn(), handleAclClose: vi.fn(), handleAclTypeChange: vi.fn() }),
}));
vi.mock('../../hooks/useCentralizedSearch', () => ({ default: () => ({}) }));
vi.mock('../shared/CentralizedSearch/CentralizedSearch.jsx', () => ({ default: () => null }));
vi.mock('../shared/RowEventsButton/RowEventsButton.jsx', () => ({ default: () => null }));
vi.mock('./AccountDialog/AccountDialog', () => ({ default: () => null }));
vi.mock('../common/ACLSelect/ACLDialog', () => ({ default: () => null }));
vi.mock('../common/HelpButton', () => ({ default: () => null }));

import { accountsApi } from '../../services/api/accountsApi';
import Accounts from './Accounts.jsx';

const accounts = Array.from({ length: 25 }, (_, i) => ({
  uuid: `a${i}`, name: `Account ${i}`, email: `a${i}@example.com`, enabled: true,
  created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-02T10:00:00Z',
}));
const lastParams = () => accountsApi.getAccounts.mock.calls.at(-1)[0];

describe('Accounts sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountsApi.getAcls.mockResolvedValue([]);
    accountsApi.getAccounts.mockResolvedValue({ data: accounts, total: 60 });
  });

  it('asks the server for the newest first on open', async () => {
    render(<Accounts />);
    await waitFor(() => expect(accountsApi.getAccounts).toHaveBeenCalled());
    expect(lastParams()).toMatchObject({ page: 1, order_by: 'created_at', order_type: 'desc' });
  });

  it('refetches with the clicked column and direction', async () => {
    render(<Accounts />);
    await screen.findByText('Account 0');

    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ order_by: 'email', order_type: 'asc' }));

    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ order_by: 'email', order_type: 'desc' }));
  });

  it('starts the new order at its first page', async () => {
    render(<Accounts />);
    await screen.findByText('Account 0');

    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));

    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, order_by: 'name', order_type: 'asc' }));
  });
});
