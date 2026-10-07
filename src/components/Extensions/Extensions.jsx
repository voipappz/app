import {
  Box,
  Button,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  TextField
} from '@mui/material';
import {
  Upload as UploadIcon,
  Call as CallIcon,
  QrCode2 as QrCodeIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ConfirmDialog, ResponsiveDialog as Dialog } from '../ui';
import ResponsiveTable from '../shared/ResponsiveTable/ResponsiveTable.jsx';
import { buildExtensionColumns } from './extensionColumns.jsx';
import Bdi from '../../i18n/Bdi';
import { useExtensions } from './Extensions';
import { extensionsApi } from '../../services/api/extensionsApi';
import { environmentsApi } from '../../services/api/environmentsApi';
import { useNotification } from '../../context/NotificationContext';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { usePermissions } from '../../hooks/usePermissions';
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
import { useOpenPhoneAs } from '../../hooks/useCallNumber';
import useEnvironmentEdit from '../../hooks/useEnvironmentEdit';
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
  const { t } = useTranslation('extensions');
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
      showSuccess(t('clickToCall.calling', { number: c2cNumber.trim(), device: c2cExt.username }));
    } catch (e) {
      showError(t('clickToCall.failed', { error: e.message }));
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
      setQrError(t('qr.authorizeFailed'));
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
    { name: 'name', label: t('search.name'), type: 'string' },
    { name: 'username', label: t('search.device'), type: 'string' },
    { name: 'enabled', label: t('search.status'), type: 'select', data: [{ uuid: 'true', name: t('search.enabled') }, { uuid: 'false', name: t('search.disabled') }] },
    { name: 'environment_uuid', label: t('search.application'), type: 'select', data: environments },
    { name: 'meta', label: t('search.tag'), type: 'tag', url: '/api/devices?action=meta_keys' },
  ], [environments, t]);

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

  const columns = buildExtensionColumns({
    t, registeredUsers, canWrite, canEditEnv, loading,
    actions: {
      onOpenPhone: handleOpenPhone,
      onClickToCall: handleOpenClick2Call,
      onShowQrCode: handleOpenQRCode,
      onEdit: (extension) => handleOpenDialog(extension),
      onDelete: handleOpenDeleteDialog,
      onEditApplication: handleEnvEdit,
    },
  });

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
    showSuccess(result?.message ? t('import.result', { message: result.message }) : t('import.done'));
    fetchExtensions();
  }, [showSuccess, fetchExtensions, t]);

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
            placeholder={t('search.placeholder')}
          />
        </Box>
        {canWrite && (
          <Tooltip title={t('toolbar.importCsv')}>
            {/* Icon-only control: a Tooltip title is not an accessible name,
                so without aria-label this button was unreachable by name for
                screen readers and by role for tests. */}
            <IconButton
              size="small"
              onClick={handleOpenImportDialog}
              disabled={loading}
              aria-label={t('toolbar.importCsv')}
              data-testid="import-csv"
            >
              <UploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip title={t('toolbar.addDevice')}>
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
            { key: 'registered', label: t('toolbar.registered'), value: regsTotal || 0, live: true, color: '#06b6d4', icon: <PhoneAndroidIcon />, active: liveDrawerOpen, onClick: () => setLiveDrawerOpen(true) },
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
            <ResponsiveTable
              columns={columns}
              rows={extensions}
              getRowId={(extension) => extension.id || extension.uuid}
              onRowClick={(extension) => handleSelectExtension(extension.id || extension.uuid)}
              selectedRowId={selectedExtensionId}
              rowSx={{ '&.Mui-selected': { bgcolor: '#e3f2fd !important' } }}
              loading={loading}
              emptyMessage={t('table.empty')}
              sortBy={sortBy}
              sortDirection={sortOrder}
              onSort={handleSortChange}
              page={page}
              rowsPerPage={rowsPerPage}
              count={totalCount}
              onPageChange={handlePageChange}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
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
        title={t('delete.title')}
        message={<Typography><Trans t={t} i18nKey="delete.message"
          components={{ name: <strong>{(extensionToDelete)?.name || (extensionToDelete)?.username}</strong> }} /></Typography>}
        description={t('delete.description')}
      />

      {/* Import Extensions CSV Dialog */}
      <ImportCSVDialog
        open={importDialogOpen}
        onClose={handleCloseImportDialog}
        onImport={handleImportCSV}
        title={t('import.title')}
        entityName={t('import.entityName')}
        environments={environments}
        requireEnvironment={true}
        onSuccess={handleImportSuccess}
        formatHint={t('import.formatHint')}
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
          <Trans t={t} i18nKey="clickToCall.title" components={{ device: <Bdi>{c2cExt?.username}</Bdi> }} />
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={t('clickToCall.numberToDial')}
            value={c2cNumber}
            onChange={(e) => setC2cNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && c2cNumber.trim() && !c2cBusy) handleClick2Call(); }}
            disabled={c2cBusy}
          />
          <Typography variant="caption" color="text.secondary">
            <Trans t={t} i18nKey="clickToCall.hint" components={{ device: <Bdi>{c2cExt?.username}</Bdi> }} />
          </Typography>
          {c2cNumber.trim() && (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <TextField
                fullWidth
                size="small"
                label={t('clickToCall.url')}
                value={c2cUrl}
                multiline
                maxRows={3}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.7rem' } }}
              />
              <Tooltip title={t('clickToCall.copyUrl')}>
                <IconButton
                  size="small"
                  onClick={() => { navigator.clipboard?.writeText(c2cUrl); showSuccess(t('clickToCall.urlCopied')); }}
                  sx={{ mt: 1 }}
                >
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          {c2cResponse && (
            <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, bgcolor: 'var(--theme-bg-secondary)', border: '1px solid var(--theme-border)' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('clickToCall.response')}</Typography>
              {(() => {
                const callUuid = c2cResponse.call_uuid || c2cResponse.uuid || c2cResponse.callUuid;
                const recUrl = c2cResponse.recording_url || c2cResponse.recordingUrl || c2cResponse.recording?.url;
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {callUuid && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ minWidth: 90, color: 'text.secondary', fontWeight: 600 }}>{t('clickToCall.callUuid')}</Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{callUuid}</Typography>
                        <Tooltip title={t('clickToCall.copy')}>
                          <IconButton size="small" onClick={() => { navigator.clipboard?.writeText(callUuid); showSuccess(t('clickToCall.copied')); }} sx={{ p: 0.25 }}>
                            <CopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                    {recUrl && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ minWidth: 90, color: 'text.secondary', fontWeight: 600 }}>{t('clickToCall.recording')}</Typography>
                        <a href={recUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{recUrl}</a>
                        <Tooltip title={t('clickToCall.copy')}>
                          <IconButton size="small" onClick={() => { navigator.clipboard?.writeText(recUrl); showSuccess(t('clickToCall.copied')); }} sx={{ p: 0.25 }}>
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
          <Button onClick={() => setC2cOpen(false)} disabled={c2cBusy}>{t('clickToCall.cancel')}</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleClick2Call}
            disabled={c2cBusy || !c2cNumber.trim()}
            startIcon={c2cBusy ? <CircularProgress size={16} color="inherit" /> : <CallIcon />}
          >
            {t('clickToCall.call')}
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
            <Trans t={t} i18nKey="qr.title" components={{ device: <Bdi>{qrExtension?.name || qrExtension?.username}</Bdi> }} />
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
                  alt={t('qr.imageAlt', { name: qrExtension?.name })}
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
                  {t('qr.loadFailed')}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, textAlign: 'center', wordBreak: 'break-all', maxWidth: 280 }}>
                <Trans t={t} i18nKey="qr.extensionLine" values={{ application: qrExtension?.environment?.name || t('qr.noEnvironment') }}
                  components={{ device: <Bdi>{qrExtension?.username}</Bdi> }} />
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
            {qrCopied ? t('qr.copied') : t('qr.copyUrl')}
          </Button>
          <Button
            variant="contained"
            onClick={handleDownloadQRCode}
            startIcon={<DownloadIcon />}
            sx={{ textTransform: 'none' }}
          >
            {t('qr.download')}
          </Button>
        </DialogActions>
      </Dialog>
      <LiveDrawer
        open={liveDrawerOpen}
        onClose={() => setLiveDrawerOpen(false)}
        title={t('live.title')}
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
