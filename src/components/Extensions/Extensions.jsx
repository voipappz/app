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
  TableSortLabel,
  TextField
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  Phone as PhoneIcon,
  Call as CallIcon,
  QrCode2 as QrCodeIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
  Add as AddIcon,
  RssFeed as RssFeedIcon,
  EventNote as EventsIcon
} from '@mui/icons-material';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfirmDialog } from '../ui';
import { useExtensions } from './Extensions';
import { extensionsApi } from '../../services/api/extensionsApi';
import { environmentsApi } from '../../services/api/environmentsApi';
import { useNotification } from '../../context/NotificationContext';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { usePermissions } from '../../hooks/usePermissions';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import { ExtensionBridge as ExtensionDialog } from '../Bridges/ExtensionBridge/ExtensionBridge';
import { DEVICE_CSV_HEADERS, deviceRowErrors, prepareDeviceRow, randomDeviceRows } from '../Bridges/ExtensionBridge/deviceRules';
import ImportCSVDialog from '../common/ImportCSVDialog/ImportCSVDialog';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import StatChips from '../shared/StatChips/StatChips.jsx';
import LiveDrawer from '../Live/LiveDrawer.jsx';
import LiveRegistrationsPanel from '../Live/panels/LiveRegistrationsPanel.jsx';
import { useLiveRegistrations } from '../Live/useLiveRegistrations';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import { orEmpty, stripedTableRowSx } from '../shared/tableTheme.jsx';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps } from '../../utils/chipStyles';
import { useOpenPhoneAs } from '../../hooks/useCallNumber';
import useEnvironmentEdit from '../../hooks/useEnvironmentEdit';
import EntityLink from '../common/EntityLink/EntityLink.jsx';
import EnvironmentDialog from '../Environments/EnvironmentDialog/EnvironmentDialog';
import EventsCountBadge from '../common/EventsCountBadge/EventsCountBadge.jsx';
import HelpButton from '../common/HelpButton';
import { GUIDE_URLS } from '../../utils/guides';
import './Extensions.css';

/**
 * Extensions Component
 * Main component for extensions management with sidebar list and wide table
 */
const Extensions = () => {
  const { can } = usePermissions();
  const canWrite = can('extensions', 'write');
  const canEditEnv = can('environments', 'write');
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const { showSuccess, showError } = useNotification();
  const { registerScreen, unregisterScreen } = useGlobalSearch();
  const openPhoneAs = useOpenPhoneAs();
  // Inline application edit — the application name in the table links here.
  const {
    envDialogOpen, envDialogEnvironment, envDialogLoading,
    handleEnvEdit, handleEnvSave, handleEnvClose
  } = useEnvironmentEdit();

  const {
    extensions,
    loading,
    dialogLoading,
    selectedExtension,
    dialogOpen,
    deleteDialogOpen,
    extensionToDelete,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    environments,
    handleOpenDialog,
    handleCloseDialog,
    handleSaveExtension,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteExtension,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    fetchExtensions,
    registeredUsers
  } = useExtensions();

  const [selectedExtensionId, setSelectedExtensionId] = useState(null);
  const [liveDrawerOpen, setLiveDrawerOpen] = useState(false);
  // Live SIP registrations for the "Registered" chip (real-time; snapshot + refreshable)
  const { totalCount: regsTotal, refresh: refreshLiveRegs } = useLiveRegistrations(true);

  // CentralizedSearch - remap 'name' segment key to 'search' which fetchExtensions expects
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
    onRefresh: fetchExtensions,
  });

  // QR Code state
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrExtension, setQrExtension] = useState(null);
  const [qrCopied, setQrCopied] = useState(false);
  // The QR endpoint is gated by a short-lived minted token (same as the WebRTC
  // phone), so we mint one when the dialog opens and use the tokenized URL.
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [qrError, setQrError] = useState('');

  // Click-to-Call dialog state
  const [c2cOpen, setC2cOpen] = useState(false);
  const [c2cExt, setC2cExt] = useState(null);
  const [c2cNumber, setC2cNumber] = useState('');
  const [c2cBusy, setC2cBusy] = useState(false);
  const [c2cToken, setC2cToken] = useState('');
  const [c2cResponse, setC2cResponse] = useState(null);

  // The phone opens in the right-hand sidebar, signed in as this device.
  const handleOpenPhone = (extension) => openPhoneAs(extension);

  // Click-to-Call: ring this extension, then bridge it to the entered number,
  // via /custom/click2call. The token comes from the extension's environment
  // profile (profile.token, fetched fresh), and the domain is the part after '@'
  // in the SIP username (e.g. 1010@pbx20.itd-pbx.com -> pbx20.itd-pbx.com).
  const handleOpenClick2Call = (extension) => {
    setC2cExt(extension);
    setC2cNumber('');
    setC2cToken('');
    setC2cResponse(null);
    setC2cOpen(true);
    // Fetch the extension's environment to read its click2call token (for the URL).
    const envUuid = extension.environment?.uuid || extension.environment_uuid || environments?.[0]?.uuid;
    if (envUuid) {
      environmentsApi.getEnvironment(envUuid)
        .then((env) => setC2cToken(env?.profile?.click2call_token || ''))
        .catch(() => setC2cToken(''));
    }
  };

  // The click2call URL, built from the token + username (split into user/domain)
  // + number. Shown in the dialog (copyable) and used for the call request.
  // The backend recomposes "username@domain", so the username is the part before
  // '@' and the domain the part after.
  const c2cUrl = useMemo(() => {
    if (!c2cExt?.username) return '';
    const atIndex = c2cExt.username.indexOf('@');
    const userPart = atIndex >= 0 ? c2cExt.username.slice(0, atIndex) : c2cExt.username;
    const domain = atIndex >= 0 ? c2cExt.username.slice(atIndex + 1) : '';
    return `${window.location.origin}/custom/click2call?token=${encodeURIComponent(c2cToken)}` +
           `&domain=${encodeURIComponent(domain)}` +
           `&username=${encodeURIComponent(userPart)}&number=${encodeURIComponent(c2cNumber.trim())}`;
  }, [c2cExt, c2cToken, c2cNumber]);

  const handleClick2Call = async () => {
    if (!c2cExt?.username || !c2cNumber.trim()) return;
    setC2cBusy(true);
    setC2cResponse(null);
    try {
      const res = await fetch(c2cUrl, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      // Keep the dialog open and surface the response (call_uuid, recording_url…).
      setC2cResponse(data || {});
      showSuccess(`Calling ${c2cNumber.trim()} from ${c2cExt.username}…`);
    } catch (e) {
      showError(`Click-to-call failed: ${e.message}`);
    } finally {
      setC2cBusy(false);
    }
  };

  // Open QR Code dialog — mint a short-lived token first (same as WebRTC), then
  // build the tokenized image URL. The QR endpoint rejects untokenized requests.
  const handleOpenQRCode = async (extension) => {
    setQrExtension(extension);
    setQrError('');
    setQrImageUrl(null);
    setQrCopied(false);
    setQrDialogOpen(true);
    if (!extension?.uuid) return;
    try {
      const res = await extensionsApi.getWebrtcToken(extension.uuid);
      if (!res?.token) throw new Error('no token');
      setQrImageUrl(`/tasks/qrcode_extension/${extension.uuid}.png?va_token=${encodeURIComponent(res.token)}`);
    } catch {
      setQrError('Could not authorize the QR code. Please try again.');
    }
  };

  // Download QR code as image
  const handleDownloadQRCode = async () => {
    const qrUrl = qrImageUrl;
    if (!qrUrl) return;

    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = `${qrExtension?.name || 'device'}-qrcode.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to download QR code:', error);
    }
  };

  // Copy QR code URL to clipboard
  const handleCopyQRCode = async () => {
    const qrUrl = qrImageUrl;
    if (!qrUrl) return;

    try {
      await navigator.clipboard.writeText(window.location.origin + qrUrl);
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy QR code URL:', error);
    }
  };

  // Register search segments with GlobalSearchContext
  const extensionSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'username', label: 'Device', type: 'string' },
    { name: 'enabled', label: 'Status', type: 'select', data: [{ uuid: 'true', name: 'Enabled' }, { uuid: 'false', name: 'Disabled' }] },
    { name: 'environment_uuid', label: 'Application', type: 'select', data: environments },
    { name: 'meta', label: 'Tag', type: 'tag', url: '/api/devices?action=meta_keys' },
  ], [environments]);

  useEffect(() => {
    registerScreen('extensions', extensionSegments, {
      onSearch: (params) => {
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
        handleFiltersChange({ search: '', username: '', enabled: '', environment_uuid: '' });
      },
    });
    return () => unregisterScreen();
  }, [extensionSegments, registerScreen, unregisterScreen, handleFiltersChange]);

  // Listen for environment change events to refresh data
  useEffect(() => {
    const handleEnvironmentChange = () => {
      console.log('Extensions: Environment changed, refreshing data...');
      fetchExtensions();
    };

    window.addEventListener('environmentChanged', handleEnvironmentChange);

    return () => {
      window.removeEventListener('environmentChanged', handleEnvironmentChange);
    };
  }, [fetchExtensions]);

  const handleSelectExtension = (extensionId) => {
    setSelectedExtensionId(extensionId);
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
      const result = await extensionsApi.importCSV(file, environmentUuid);
      return result;
    } catch (error) {
      console.error('Error importing extensions:', error);
      throw error;
    }
  }, []);

  const handleImportSuccess = useCallback((result) => {
    showSuccess(result?.message ? `Devices: ${result.message}` : 'Devices imported');
    fetchExtensions();
  }, [showSuccess, fetchExtensions]);

  // Fresh example rows every time the import opens (deviceRules.js).
  const importExamples = useMemo(() => (importDialogOpen ? randomDeviceRows(3) : []), [importDialogOpen]);

  return (
    <Box
      className="extensions-container"
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
            segments={extensionSegments}
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
            {/* Icon-only control: a Tooltip title is not an accessible name,
                so without aria-label this button was unreachable by name for
                screen readers and by role for tests. */}
            <IconButton
              size="small"
              onClick={handleOpenImportDialog}
              disabled={loading}
              aria-label="Import CSV"
              data-testid="import-csv"
            >
              <UploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip title="Add Device">
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

      {/* Live SIP registrations chip — click to pop out the live registrations monitor */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
        <StatChips
          items={[
            { key: 'registered', label: 'Registered', value: regsTotal || 0, live: true, color: '#06b6d4', icon: <PhoneAndroidIcon />, active: liveDrawerOpen, onClick: () => setLiveDrawerOpen(true) },
          ]}
        />
      </Box>

      {/* Device report charts — fixed Events-style strip with report swap */}

      {/* Extensions Table Area - Full width, no sidebar */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
        {/* Extensions Table */}
        <Paper
          className="extensions-content"
          elevation={3}
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          {/* Extensions Table */}
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
                  <TableCell align="center" sx={{ width: 50 }}>
                    <Tooltip title="SIP Registration Status">
                      <RssFeedIcon fontSize="small" />
                    </Tooltip>
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
                      active={sortBy === 'username'}
                      direction={sortBy === 'username' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('username')}
                    >
                      Device
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
                  <TableCell>Application</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && extensions.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <TableCell key={j}><Skeleton height={20} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : extensions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No devices found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  extensions.map((extension) => {
                    const extensionId = extension.id || extension.uuid;
                    const isSelected = selectedExtensionId === extensionId;

                    return (
                      <TableRow
                        key={extensionId}
                        hover
                        selected={isSelected}
                        sx={{
                          ...stripedTableRowSx,
                          cursor: 'pointer',
                          '&.Mui-selected': {
                            bgcolor: '#e3f2fd !important'
                          }
                        }}
                        onClick={() => handleSelectExtension(extensionId)}
                      >
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(extension.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(extension.updated_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {(() => {
                            const isRegistered = extension.switch === true || registeredUsers.has(extension.username);
                            // The API attaches switch-side detail (user agent, contact,
                            // IP, expiry) to each row specifically for this tooltip —
                            // see registration_info() in endpoints/extensions.rb — and
                            // it was being thrown away for a static string.
                            const reg = extension.registration;
                            const detail = reg && [
                              ['User agent', reg.user_agent],
                              ['Contact', reg.contact],
                              ['IP', [reg.network_ip, reg.network_port].filter(Boolean).join(':')],
                              ['Proto', reg.network_proto],
                              ['Host', reg.hostname],
                              ['Expires', reg.expires],
                            ].filter(([, v]) => v);
                            return (
                              <Tooltip
                                title={
                                  !isRegistered ? 'Not Registered (Offline)'
                                    : detail && detail.length ? (
                                      <Box sx={{ py: 0.25 }}>
                                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, mb: 0.25 }}>
                                          Registered (Online)
                                        </Typography>
                                        {detail.map(([label, value]) => (
                                          <Typography key={label} sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                                            {label}: {value}
                                          </Typography>
                                        ))}
                                      </Box>
                                    ) : 'Registered (Online)'
                                }
                              >
                                <RssFeedIcon
                                  fontSize="small"
                                  sx={{
                                    color: isRegistered ? '#29AB87' : '#ccc',
                                    cursor: 'default'
                                  }}
                                />
                              </Tooltip>
                            );
                          })()}
                        </TableCell>
                        <TableCell align="center">
                          <Chip {...getEnabledChipProps(extension.enabled)} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {orEmpty(extension.username)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {orEmpty(extension.name)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <EntityLink
                            name={extension.environment?.name}
                            ariaLabel={`Edit application ${extension.environment?.name || ''}`}
                            onEdit={extension.environment?.uuid && canEditEnv ? () => handleEnvEdit(extension.environment) : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <MetaTagChips meta={extension.meta} />
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                            <Tooltip title="Open phone as this device">
                              <IconButton
                                data-testid="phone-extension-button"
                                size="small"
                                onClick={() => handleOpenPhone(extension)}
                                disabled={loading}
                                color="primary"
                              >
                                <PhoneIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Click to Call">
                              <IconButton
                                data-testid="click2call-extension-button"
                                size="small"
                                onClick={() => handleOpenClick2Call(extension)}
                                disabled={loading}
                                color="success"
                              >
                                <CallIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Show QR Code">
                              <IconButton
                                data-testid="qrcode-extension-button"
                                size="small"
                                onClick={() => handleOpenQRCode(extension)}
                                disabled={loading}
                              >
                                <QrCodeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {canWrite && (
                              <Tooltip title="Edit device">
                                <IconButton
                                  data-testid="edit-extension-button"
                                  size="small"
                                  onClick={() => handleOpenDialog(extension)}
                                  disabled={loading}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <RowEventsButton subject="extension" uuid={extension.uuid} />
                            {canWrite && (
                              <Tooltip title="Delete device">
                                <IconButton
                                  data-testid="delete-extension-button"
                                  size="small"
                                  onClick={() => handleOpenDeleteDialog(extension)}
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
      <ExtensionDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveExtension}
        extension={selectedExtension}
        environments={environments}
        mode={selectedExtension ? 'edit' : 'create'}
        hideEnvironment={false}
        handleApiInternally={false}
        loading={dialogLoading}
      />

      {/* Application edit — opened from the application name link in the table */}
      <EnvironmentDialog
        open={envDialogOpen}
        onClose={handleEnvClose}
        onSave={async (formData) => { await handleEnvSave(formData); fetchExtensions(); }}
        environment={envDialogEnvironment}
        loading={envDialogLoading}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteExtension}
        loading={dialogLoading}
        title="Delete Device"
        message={<Typography>Are you sure you want to delete device{' '}
          <strong>{(extensionToDelete)?.name || (extensionToDelete)?.username}</strong>?</Typography>}
        description="This action cannot be undone and will remove the device data."
      />

      {/* Import Extensions CSV Dialog */}
      <ImportCSVDialog
        open={importDialogOpen}
        onClose={handleCloseImportDialog}
        onImport={handleImportCSV}
        title="Import Devices from CSV"
        entityName="Devices"
        environments={environments}
        requireEnvironment={true}
        onSuccess={handleImportSuccess}
        formatHint="Username,Name,Password,CallerID — Username and Name are required; a missing password is generated"
        showTemplateOption={true}
        templateHeaders={DEVICE_CSV_HEADERS}
        templateData={importExamples}
        validateRow={deviceRowErrors}
        prepareRow={prepareDeviceRow}
      />

      {/* Click-to-Call Dialog */}
      <Dialog open={c2cOpen} onClose={() => setC2cOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CallIcon color="success" />
          Click to Call — {c2cExt?.username}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Number to dial"
            value={c2cNumber}
            onChange={(e) => setC2cNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && c2cNumber.trim() && !c2cBusy) handleClick2Call(); }}
            disabled={c2cBusy}
          />
          <Typography variant="caption" color="text.secondary">
            Rings extension {c2cExt?.username}, then bridges the call to the number.
          </Typography>
          {c2cNumber.trim() && (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <TextField
                fullWidth
                size="small"
                label="Click2Call URL"
                value={c2cUrl}
                multiline
                maxRows={3}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.7rem' } }}
              />
              <Tooltip title="Copy URL">
                <IconButton
                  size="small"
                  onClick={() => { navigator.clipboard?.writeText(c2cUrl); showSuccess('URL copied to clipboard'); }}
                  sx={{ mt: 1 }}
                >
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          {c2cResponse && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, bgcolor: 'var(--theme-bg-secondary)', border: '1px solid var(--theme-border)' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Response</Typography>
              {(() => {
                const callUuid = c2cResponse.call_uuid || c2cResponse.uuid || c2cResponse.callUuid;
                const recUrl = c2cResponse.recording_url || c2cResponse.recordingUrl || c2cResponse.recording?.url;
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {callUuid && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ minWidth: 90, color: 'text.secondary', fontWeight: 600 }}>Call UUID</Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{callUuid}</Typography>
                        <Tooltip title="Copy">
                          <IconButton size="small" onClick={() => { navigator.clipboard?.writeText(callUuid); showSuccess('Copied'); }} sx={{ p: 0.25 }}>
                            <CopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                    {recUrl && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ minWidth: 90, color: 'text.secondary', fontWeight: 600 }}>Recording</Typography>
                        <a href={recUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{recUrl}</a>
                        <Tooltip title="Copy">
                          <IconButton size="small" onClick={() => { navigator.clipboard?.writeText(recUrl); showSuccess('Copied'); }} sx={{ p: 0.25 }}>
                            <CopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                    <Box sx={{ mt: 0.5, p: 1, borderRadius: 1, bgcolor: 'var(--theme-bg-primary)', fontFamily: 'monospace', fontSize: '0.68rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto' }}>
                      {JSON.stringify(c2cResponse, null, 2)}
                    </Box>
                  </Box>
                );
              })()}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setC2cOpen(false)} disabled={c2cBusy}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleClick2Call}
            disabled={c2cBusy || !c2cNumber.trim()}
            startIcon={c2cBusy ? <CircularProgress size={16} color="inherit" /> : <CallIcon />}
          >
            Call
          </Button>
        </DialogActions>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog
        open={qrDialogOpen}
        onClose={() => setQrDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QrCodeIcon color="primary" />
            QR Code - {qrExtension?.name || qrExtension?.username}
          </Typography>
          <IconButton onClick={() => setQrDialogOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3 }}>
          {qrError ? (
            <Typography color="error" variant="body2" sx={{ py: 4 }}>{qrError}</Typography>
          ) : !qrImageUrl ? (
            <CircularProgress sx={{ my: 4 }} />
          ) : (
            <>
              <Box sx={{ p: 2, bgcolor: 'var(--mui-palette-background-paper)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                <img
                  src={qrImageUrl}
                  alt={`QR Code for ${qrExtension?.name}`}
                  style={{ width: 200, height: 200, display: 'block' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) {
                      e.target.nextSibling.style.display = 'block';
                    }
                  }}
                />
                <Typography
                  variant="body2"
                  color="error"
                  sx={{ display: 'none', textAlign: 'center', p: 2 }}
                >
                  Failed to load QR code
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, textAlign: 'center', wordBreak: 'break-all', maxWidth: 280 }}>
                Extension: {qrExtension?.username} | {qrExtension?.environment?.name || 'No environment'}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleCopyQRCode}
            startIcon={<CopyIcon />}
            color={qrCopied ? 'success' : 'primary'}
            sx={{ textTransform: 'none' }}
          >
            {qrCopied ? 'Copied!' : 'Copy URL'}
          </Button>
          <Button
            variant="contained"
            onClick={handleDownloadQRCode}
            startIcon={<DownloadIcon />}
            sx={{ textTransform: 'none' }}
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>
      <LiveDrawer
        open={liveDrawerOpen}
        onClose={() => setLiveDrawerOpen(false)}
        title="SIP Registrations"
        icon={<PhoneAndroidIcon sx={{ color: '#06b6d4' }} />}
        count={regsTotal}
        onRefresh={refreshLiveRegs}
      >
        {liveDrawerOpen && <LiveRegistrationsPanel open={liveDrawerOpen} />}
      </LiveDrawer>
    </Box>
  );
};

export default Extensions;
