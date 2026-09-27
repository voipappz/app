import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The screen is rendered for real; everything around it (data hook, contexts,
// heavy panels) is stubbed so the two link cells are what is under test.
const users = [{
  uuid: 'u-1', name: 'Dana', email: 'dana@example.com', enabled: true,
  acl: { uuid: 'acl-1', name: 'Agent' },
  environment: { uuid: 'env-1', name: 'Sales' },
  status: { name: 'Active' }, skills: [],
}];
const fetchUsers = vi.fn();
vi.mock('./Users', () => ({ useUsers: () => ({
  users, loading: false, dialogLoading: false, selectedUser: null, dialogOpen: false, deleteDialogOpen: false,
  userToDelete: null, duplicateDialogOpen: false, userToDuplicate: null, page: 0, rowsPerPage: 25, totalCount: 1,
  sortBy: 'name', sortOrder: 'asc', environments: [], acls: [], statuses: [], referenceDataLoading: false,
  handleOpenDialog: vi.fn(), handleCloseDialog: vi.fn(), handleSaveUser: vi.fn(), handleOpenDeleteDialog: vi.fn(),
  handleCloseDeleteDialog: vi.fn(), handleDeleteUser: vi.fn(), handleOpenDuplicateDialog: vi.fn(),
  handleCloseDuplicateDialog: vi.fn(), handleDuplicateUser: vi.fn(), handlePageChange: vi.fn(),
  handleRowsPerPageChange: vi.fn(), handleSortChange: vi.fn(), handleFiltersChange: vi.fn(), handleResetFilters: vi.fn(),
  handleResetPassword: vi.fn(), handleDirectPasswordReset: vi.fn(), fetchUsers,
}) }));

const canWrite = vi.fn(() => true);
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => canWrite() }) }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => false }));
vi.mock('../../context/NotificationContext', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }));
vi.mock('../../context/GlobalSearchContext', () => ({ useGlobalSearch: () => ({ registerScreen: vi.fn(), unregisterScreen: vi.fn() }) }));
vi.mock('../../context/CustomerEnvironmentContext', () => ({ useCustomerEnvironment: () => ({ selectedEnvironments: [], selectedCustomer: null, fetchSelectedEnvironments: vi.fn() }) }));
vi.mock('../Live/useLiveAgents', () => ({ useLiveAgents: () => ({ statistics: {}, totalCount: 0, refresh: vi.fn() }) }));
vi.mock('../../hooks/useCentralizedSearch', () => ({ default: () => ({
  dateRange: null, quickSearchText: '', currentSearchParams: {}, handleFilterChange: vi.fn(), handleQuickSearch: vi.fn(),
  handleClearAllFilters: vi.fn(), handleDateRangeChange: vi.fn(), handleRefresh: vi.fn(),
}) }));
vi.mock('../../services/api/usersApi', () => ({ usersApi: {} }));
vi.mock('./UserDialog/UserDialog', () => ({ default: () => null }));
vi.mock('./DuplicateUserDialog/DuplicateUserDialog', () => ({ default: () => null }));
vi.mock('../common/ImportCSVDialog/ImportCSVDialog', () => ({ default: () => null }));
vi.mock('../shared/CentralizedSearch/CentralizedSearch.jsx', () => ({ default: () => null }));
vi.mock('../shared/StatChips/StatChips.jsx', () => ({ default: () => null }));
vi.mock('../Live/LiveDrawer.jsx', () => ({ default: () => null }));
vi.mock('../Live/panels/LiveAgentsPanel.jsx', () => ({ default: () => null }));
vi.mock('../common/EventsCountBadge/EventsCountBadge.jsx', () => ({ default: () => null }));
vi.mock('../common/HelpButton', () => ({ default: () => null }));
vi.mock('../Environments/EnvironmentDialog/EnvironmentDialog', () => ({
  default: ({ open, environment }) => (open ? <div role="dialog">Application dialog: {environment?.name}</div> : null),
}));
vi.mock('../common/ACLSelect/ACLDialog', () => ({
  default: ({ open, acl, mode }) => (open ? <div role="dialog">ACL dialog ({mode}): {acl?.name}</div> : null),
}));
vi.mock('../../services/api/environmentsApi', () => ({ environmentsApi: { getEnvironment: vi.fn(), updateEnvironment: vi.fn() } }));
vi.mock('../../services/api/aclsApi', () => ({ aclsApi: {
  getACL: vi.fn(), updateACL: vi.fn(), getACLTypes: vi.fn().mockResolvedValue([]), getACLTypeData: vi.fn().mockResolvedValue({}),
  getACLs: vi.fn().mockResolvedValue([]), createACL: vi.fn(), deleteACL: vi.fn(),
} }));

import { environmentsApi } from '../../services/api/environmentsApi';
import { aclsApi } from '../../services/api/aclsApi';
import Users from './Users.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  canWrite.mockReturnValue(true);
  environmentsApi.getEnvironment.mockResolvedValue({ uuid: 'env-1', name: 'Sales (full)' });
  aclsApi.getACL.mockResolvedValue({ uuid: 'acl-1', name: 'Agent (full)', type: 'user' });
});

describe('Users linked entities', () => {
  it('opens the application editor from the Application cell', async () => {
    const user = userEvent.setup();
    render(<Users />);
    await user.click(screen.getByRole('button', { name: 'Edit application Sales' }));
    expect(environmentsApi.getEnvironment).toHaveBeenCalledWith('env-1');
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Application dialog: Sales (full)'));
  });

  it('opens the ACL editor from the Role cell', async () => {
    const user = userEvent.setup();
    render(<Users />);
    await user.click(screen.getByRole('button', { name: 'Edit role Agent' }));
    expect(aclsApi.getACL).toHaveBeenCalledWith('acl-1');
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('ACL dialog (edit): Agent (full)'));
  });

  it('shows plain names without write permission', () => {
    canWrite.mockReturnValue(false);
    render(<Users />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit application/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit role/ })).not.toBeInTheDocument();
  });
});
