import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Skeleton,
  TableSortLabel
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  LockReset as ResetPasswordIcon,
  Upload as UploadIcon,
  EventNote as EventsIcon,
  ContentCopy as DuplicateIcon,
  QrCode2 as QrCodeIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfirmDialog } from '../ui';
import { useUsers } from './Users';
import { usersApi } from '../../services/api/usersApi';
import EventsCountBadge from '../common/EventsCountBadge/EventsCountBadge.jsx';
import { useNotification } from '../../context/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import UserDialog from './UserDialog/UserDialog';
import ImportCSVDialog from '../common/ImportCSVDialog/ImportCSVDialog';
import DuplicateUserDialog from './DuplicateUserDialog/DuplicateUserDialog';
import UserLoginQrDialog from './UserLoginQr/UserLoginQrDialog.jsx';
import { SkillChipList } from '../common/SkillChip';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps } from '../../utils/chipStyles';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import StatChips from '../shared/StatChips/StatChips.jsx';
import LiveDrawer from '../Live/LiveDrawer.jsx';
import LiveAgentsPanel from '../Live/panels/LiveAgentsPanel.jsx';
import { useLiveAgents } from '../Live/useLiveAgents';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import PeopleIcon from '@mui/icons-material/People';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import { orEmpty, stripedTableRowSx } from '../shared/tableTheme.jsx';
import HelpButton from '../common/HelpButton';
import { GUIDE_URLS } from '../../utils/guides';
import './Users.css';
import CopyableEmail from '../common/CopyableEmail/CopyableEmail.jsx';
import EntityLink from '../common/EntityLink/EntityLink.jsx';
import EnvironmentDialog from '../Environments/EnvironmentDialog/EnvironmentDialog';
import ACLDialog from '../common/ACLSelect/ACLDialog';
import useEnvironmentEdit from '../../hooks/useEnvironmentEdit';
import useAclEdit from '../../hooks/useAclEdit';
import { useIsUserSession } from '../../hooks/useIsUserSession';

/**
 * Users Component
 * Main component for users management with sidebar list and wide table
 */
const Users = () => {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // The user whose sign-in QR is open (row action).
  const [loginQrUser, setLoginQrUser] = useState(null);

  const { showSuccess } = useNotification();
  const { can } = usePermissions();
  const canWrite = can('users', 'write');
  const userSession = useIsUserSession();
  // Editing the application or role behind a row is a console affordance.
  const canEditLinked = canWrite && !userSession;
  const { registerScreen, unregisterScreen } = useGlobalSearch();
  const {
    envDialogOpen, envDialogEnvironment, envDialogLoading,
    handleEnvEdit, handleEnvSave, handleEnvClose,
  } = useEnvironmentEdit();
  const {
    aclDialogOpen, aclDialogAcl, aclDialogLoading, aclSaveError,
    handleAclEdit, handleAclSave, handleAclClose,
    types: aclTypes, typesLoading: aclTypesLoading, typeData: aclTypeData, typeDataLoading: aclTypeDataLoading, handleAclTypeChange,
  } = useAclEdit();

  const {
    users,
    loading,
    dialogLoading,
    selectedUser,
    dialogOpen,
    deleteDialogOpen,
    userToDelete,
    duplicateDialogOpen,
    userToDuplicate,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    environments,
    acls,
    statuses,
    referenceDataLoading,
    handleOpenDialog,
    handleCloseDialog,
    handleSaveUser,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteUser,
    handleOpenDuplicateDialog,
    handleCloseDuplicateDialog,
    handleDuplicateUser,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    handleResetPassword,
    handleDirectPasswordReset,
    fetchUsers,
  } = useUsers();

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [liveDrawerOpen, setLiveDrawerOpen] = useState(false);
  // Live agent status for the chip strip (real-time; snapshot + refreshable)
  const { selectedEnvironments } = useCustomerEnvironment();
  const liveEnvUuid = selectedEnvironments?.[0]?.uuid || null;
  const { statistics: agentStats, totalCount: agentsTotal, refresh: refreshLiveAgents } = useLiveAgents(true, liveEnvUuid);

  // Register search segments with GlobalSearchContext
  const userSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'enabled', label: 'Status', type: 'select', data: [{ uuid: 'true', name: 'Active' }, { uuid: 'false', name: 'Inactive' }] },
    { name: 'environment_uuid', label: 'Application', type: 'select', data: environments },
    { name: 'acl_uuid', label: 'Role', type: 'select', data: acls },
    { name: 'status_uuid', label: 'Status Type', type: 'select', data: statuses },
    { name: 'meta', label: 'Skill', type: 'skill', url: '/api/users?action=meta_keys' },
  ], [environments, acls, statuses]);

  // CentralizedSearch - remap 'name' segment key to 'search' which fetchUsers expects
  const handleCentralizedFiltersChange = useCallback((parsedFilters) => {
    const remapped = { ...parsedFilters };
    if ('name' in remapped) {
      remapped.search = remapped.name;
      delete remapped.name;
    }
    handleFiltersChange(remapped);
  }, [handleFiltersChange]);

  const centralizedSearch = useCentralizedSearch({
    onFiltersChange: handleCentralizedFiltersChange,
    onResetFilters: handleResetFilters,
    onRefresh: fetchUsers,
  });

  useEffect(() => {
    registerScreen('users', userSegments, {
      onSearch: (params) => {
        // Convert search params to filters format
        const newFilters = {};
        Object.entries(params).forEach(([key, value]) => {
          if (key === 'search[text]') {
            newFilters.search = value;
          } else {
            const match = key.match(/search\[(\w+)\]/);
            if (match) newFilters[match[1]] = value;
          }
        });
        handleFiltersChange(newFilters);
      },
      onClear: () => {
        handleFiltersChange({
          search: '', email: '', enabled: '',
          environment_uuid: '', acl_uuid: '', status_uuid: '',
          skill_uuids: [], created_at: '', updated_at: ''
        });
      },
    });
    return () => unregisterScreen();
  }, [userSegments, registerScreen, unregisterScreen, handleFiltersChange]);

  // Listen for environment change events to refresh data
  useEffect(() => {
    const handleEnvironmentChange = () => {
      console.log('🔄 Environment changed, refreshing Users data...');
      fetchUsers();
    };

    window.addEventListener('environmentChanged', handleEnvironmentChange);

    return () => {
      window.removeEventListener('environmentChanged', handleEnvironmentChange);
    };
  }, [fetchUsers]);

  const handleSelectUser = (userId) => {
    setSelectedUserId(userId);
  };

  // Import CSV handlers
  const handleOpenImportDialog = useCallback(() => {
    setImportDialogOpen(true);
  }, []);

  const handleCloseImportDialog = useCallback(() => {
    setImportDialogOpen(false);
  }, []);

  const handleImportCSV = useCallback(async (file, environmentUuid) => {
    try {
      const result = await usersApi.importCSV(file, environmentUuid);
      return result;
    } catch (error) {
      console.error('Error importing users:', error);
      throw error;
    }
  }, []);

  const handleImportSuccess = useCallback(() => {
    showSuccess('Users imported successfully');
    fetchUsers();
  }, [showSuccess, fetchUsers]);

  return (
    <Box
      className="users-container"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 0.5, sm: 1.5 },
        py: { xs: 0.5, sm: 1 },
        height: '100%',
        width: '100%'
      }}
    >
      {/* Header: Title + Search + Add Button on one line */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CentralizedSearch
            segments={userSegments}
            currentSearchParams={centralizedSearch.currentSearchParams}
            onFilterChange={centralizedSearch.handleFilterChange}
            onQuickSearch={centralizedSearch.handleQuickSearch}
            onClearAllFilters={centralizedSearch.handleClearAllFilters}
            dateRange={centralizedSearch.dateRange}
            onDateRangeChange={centralizedSearch.handleDateRangeChange}
            onRefresh={centralizedSearch.handleRefresh}
            quickSearchText={centralizedSearch.quickSearchText}
            onQuickSearchChange={centralizedSearch.handleQuickSearchChange}
            placeholder="Search by name, or use field:value (e.g. enabled:true)"
          />
        </Box>
        {canWrite && (
          <Tooltip title="Import CSV">
            <IconButton
              size="small"
              onClick={handleOpenImportDialog}
              disabled={loading}
            >
              <UploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip title="Add User">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenDialog()}
              disabled={loading}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Live agent status chips — click any to pop out the live agents monitor */}
      {liveEnvUuid && (
        <StatChips
          sx={{ mt: 1 }}
          items={[
            { key: 'available', label: 'Available', value: agentStats.available || 0, live: true, color: '#10b981', onClick: () => setLiveDrawerOpen(true) },
            { key: 'oncall', label: 'On Call', value: agentStats.onCall || 0, color: '#ef4444', onClick: () => setLiveDrawerOpen(true) },
            { key: 'onbreak', label: 'On Break', value: agentStats.onBreak || 0, color: '#f59e0b', onClick: () => setLiveDrawerOpen(true) },
            { key: 'agents', label: 'Agents', value: agentsTotal || 0, color: '#3b82f6', icon: <PeopleIcon />, active: liveDrawerOpen, onClick: () => setLiveDrawerOpen(true) },
          ]}
        />
      )}

      {/* Users Table Area - Full width, no sidebar */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
        {/* Users Table */}
        <Paper
          className="users-content"
          elevation={3}
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          {/* Users Table */}
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            <TableContainer>
              <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'created_at'}
                      direction={sortBy === 'created_at' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('created_at')}
                    >
                      Created At
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'updated_at'}
                      direction={sortBy === 'updated_at' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('updated_at')}
                    >
                      Updated At
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center">
                    <TableSortLabel
                      active={sortBy === 'enabled'}
                      direction={sortBy === 'enabled' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('enabled')}
                    >
                      Enabled
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'name'}
                      direction={sortBy === 'name' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('name')}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'email'}
                      direction={sortBy === 'email' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('email')}
                    >
                      Email
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>ACL</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Skills</TableCell>
                  <TableCell>Application</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && users.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((__, j) => (
                        <TableCell key={j}><Skeleton height={20} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No users found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const userId = user.id || user.uuid;
                    const isSelected = selectedUserId === userId;

                    return (
                      <TableRow
                        key={userId}
                        hover
                        selected={isSelected}
                        sx={{
                          ...stripedTableRowSx,
                          cursor: 'pointer',
                          '&.Mui-selected': {
                            bgcolor: '#e3f2fd !important'
                          }
                        }}
                        onClick={() => handleSelectUser(userId)}
                      >
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(user.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(user.updated_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip {...getEnabledChipProps(user.enabled)} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {orEmpty(user.name)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            <CopyableEmail email={user.email} fallback={orEmpty(user.email)} />
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <EntityLink
                            name={user.acl?.name}
                            ariaLabel={`Edit role ${user.acl?.name || ''}`}
                            onEdit={canEditLinked && user.acl?.uuid ? () => handleAclEdit(user.acl) : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {orEmpty(user.status?.name)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {user.skills && user.skills.length > 0 ? (
                            <SkillChipList
                              skills={user.skills}
                              maxDisplay={3}
                              size="small"
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <EntityLink
                            name={user.environment?.name}
                            ariaLabel={`Edit application ${user.environment?.name || ''}`}
                            onEdit={canEditLinked && user.environment?.uuid ? () => handleEnvEdit(user.environment) : undefined}
                          />
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                            {canWrite && (
                              <Tooltip title="Edit user">
                                <IconButton
                                  data-testid="edit-user-button"
                                  size="small"
                                  onClick={() => handleOpenDialog(user)}
                                  disabled={loading}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canWrite && (
                              <Tooltip title="Duplicate user">
                                <IconButton
                                  data-testid="duplicate-user-button"
                                  size="small"
                                  onClick={() => handleOpenDuplicateDialog(user)}
                                  disabled={loading}
                                >
                                  <DuplicateIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canWrite && (
                              <Tooltip title="Sign-in QR">
                                <IconButton
                                  data-testid="user-login-qr-button"
                                  aria-label={`Sign-in QR for ${user.name || user.email}`}
                                  size="small"
                                  onClick={() => setLoginQrUser(user)}
                                  disabled={loading || user.enabled === false}
                                >
                                  <QrCodeIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canWrite && (
                              <Tooltip title="Reset password">
                                <IconButton
                                  size="small"
                                  onClick={() => handleResetPassword(user)}
                                  disabled={loading}
                                >
                                  <ResetPasswordIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <RowEventsButton subject="user" uuid={user.uuid} />
                            {canWrite && (
                              <Tooltip title="Delete user">
                                <IconButton
                                  data-testid="delete-user-button"
                                  size="small"
                                  onClick={() => handleOpenDeleteDialog(user)}
                                  disabled={loading}
                                  color="error"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

            {/* Pagination */}
            <TablePagination
              component="div"
              count={totalCount}
              page={page}
              onPageChange={handlePageChange}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
              sx={{ borderTop: '1px solid var(--mui-palette-divider)' }}
            />
          </Box>
        </Paper>

      </Box>

      {/* Create/Edit Dialog */}
      <UserDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveUser}
        onResetPassword={handleDirectPasswordReset}
        user={selectedUser}
        loading={dialogLoading || referenceDataLoading}
        environments={environments}
        acls={acls}
        statuses={statuses}
        canWrite={canWrite}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteUser}
        loading={dialogLoading}
        title="Delete User"
        message={<Typography>Are you sure you want to delete user{' '}
          <strong>{(userToDelete)?.name}</strong>?</Typography>}
        description="This action cannot be undone and will remove all user data."
      />

      {/* Duplicate User Dialog */}
      <UserLoginQrDialog open={Boolean(loginQrUser)} user={loginQrUser} onClose={() => setLoginQrUser(null)} />

      <DuplicateUserDialog
        open={duplicateDialogOpen}
        onClose={handleCloseDuplicateDialog}
        onDuplicate={handleDuplicateUser}
        user={userToDuplicate}
        loading={dialogLoading}
      />

      {/* Import Users CSV Dialog */}
      <ImportCSVDialog
        open={importDialogOpen}
        onClose={handleCloseImportDialog}
        onImport={handleImportCSV}
        title="Import Users from CSV"
        entityName="Users"
        environments={environments}
        requireEnvironment={true}
        onSuccess={handleImportSuccess}
        formatHint="Username,Name,Password,caller_id_number"
        showTemplateOption={true}
        templateHeaders={['Username', 'Name', 'Password', 'caller_id_number']}
        templateData={[
          { Username: '930891', Name: '210', Password: 'P6Pq8fZxoj210', caller_id_number: '308045551' },
          { Username: '930892', Name: '211', Password: 'P6Pq8fZxoj211', caller_id_number: '308045551' }
        ]}
      />

      <LiveDrawer
        open={liveDrawerOpen}
        onClose={() => setLiveDrawerOpen(false)}
        title="Live Agents"
        icon={<PeopleIcon sx={{ color: '#3b82f6' }} />}
        count={agentsTotal}
        onRefresh={refreshLiveAgents}
      >
        {liveDrawerOpen && <LiveAgentsPanel open={liveDrawerOpen} />}
      </LiveDrawer>

      <EnvironmentDialog
        open={envDialogOpen}
        onClose={handleEnvClose}
        onSave={async (formData) => { await handleEnvSave(formData); fetchUsers(); }}
        environment={envDialogEnvironment}
        loading={envDialogLoading}
      />

      <ACLDialog
        open={aclDialogOpen}
        onClose={handleAclClose}
        onSave={async (formData) => { await handleAclSave(formData); fetchUsers(); }}
        mode="edit"
        acl={aclDialogAcl}
        types={aclTypes}
        typesLoading={aclTypesLoading}
        typeData={aclTypeData}
        typeDataLoading={aclTypeDataLoading}
        onTypeChange={handleAclTypeChange}
        saving={aclDialogLoading}
        error={aclSaveError}
      />
    </Box>
  );
};

export default Users;
