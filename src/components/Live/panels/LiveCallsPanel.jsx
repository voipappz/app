import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Box, Typography, Alert, Button, IconButton, Tooltip, Menu, MenuItem,
  ListItemIcon, ListItemText, Paper, TextField, InputAdornment, Chip,
  DialogTitle, DialogContent, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import HearingIcon from '@mui/icons-material/Hearing';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import GroupsIcon from '@mui/icons-material/Groups';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MicOffIcon from '@mui/icons-material/MicOff';
import MicIcon from '@mui/icons-material/Mic';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useLiveCalls } from '../useLiveCalls';
import { liveApi } from '../../../services/api/liveApi';
import { useNotification } from '../../../context/NotificationContext';
import { stripedDataGridSx } from '../../shared/tableTheme.jsx';
import LiveChartStrip from '../LiveChartStrip';
import ResponsiveTable from '../../shared/ResponsiveTable/ResponsiveTable';
import { ResponsiveDialog } from '../../ui';
import { usePermissions } from '../../../hooks/usePermissions';
import { useTranslation } from 'react-i18next';

const gridSx = {
  ...stripedDataGridSx,
  backgroundColor: 'var(--mui-palette-background-paper)',
  color: 'var(--mui-palette-text-primary)',
  border: '1px solid var(--mui-palette-divider)',
  '& .MuiDataGrid-cell': { color: 'var(--mui-palette-text-primary)', borderColor: 'var(--mui-palette-divider)', cursor: 'pointer' },
  '& .MuiDataGrid-columnHeader': { backgroundColor: 'var(--mui-palette-surface-muted)', color: 'var(--mui-palette-text-primary)', borderColor: 'var(--mui-palette-divider)' },
  '& .MuiDataGrid-footerContainer': { backgroundColor: 'var(--mui-palette-surface-muted)', color: 'var(--mui-palette-text-primary)', borderColor: 'var(--mui-palette-divider)' },
};

const getRowId = (row) => row.id || row.uuid || row.call_uuid || `row-${Math.random().toString(36).slice(2, 11)}`;

// Fields worth grouping the live calls by (columns FreeSWITCH reports);
// their names are in live.json liveCalls.group.
const GROUP_BY_FIELDS = ['direction', 'callstate', 'application', 'dest'];

// On a phone a call is a card: the caller on top, where it goes under it,
// then a few labelled values. A column not named here is in the details.
const CARD_PRIORITY = { cid_name: 'primary', dest: 'secondary', cid_num: 'meta', direction: 'meta', callstate: 'meta', created: 'meta' };
const cardPriority = (field, index, fields) => CARD_PRIORITY[field]
  || (index === 0 && !fields.some((f) => CARD_PRIORITY[f] === 'primary') ? 'primary' : 'desktopOnly');

/** A live call's fields, as FreeSWITCH names them, one per line. */
const LiveRowFields = ({ row }) => Object.entries(row)
  .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
  .map(([k, v]) => (
    <Box key={k} sx={{ display: 'flex', py: 0.5, borderBottom: '1px solid var(--mui-palette-divider)' }}>
      <Typography variant="caption" sx={{ width: 110, flexShrink: 0, color: 'var(--mui-palette-text-secondary)', fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{k}</Typography>
      <Typography variant="caption" sx={{ color: 'text.primary', wordBreak: 'break-all' }}>{String(v)}</Typography>
    </Box>
  ));

/**
 * Events-style detail reveal for a single live call: beside the grid on a
 * desktop, full screen on a phone.
 */
const LiveRowDetail = ({ row, onClose, asDialog }) => {
  const { t } = useTranslation('live');
  if (asDialog) {
    return (
      <ResponsiveDialog open onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ flexGrow: 1 }}>{t('liveCalls.detail')}</Box>
          <IconButton onClick={onClose} aria-label={t('liveCalls.closeDetail')}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers><LiveRowFields row={row} /></DialogContent>
      </ResponsiveDialog>
    );
  }
  return (
    <Paper elevation={0} sx={{ width: 300, flexShrink: 0, border: '1px solid var(--mui-palette-divider)', borderRadius: 2, p: 2, backgroundColor: 'var(--mui-palette-background-paper)', overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--mui-palette-text-primary)', flexGrow: 1 }}>{t('liveCalls.detail')}</Typography>
        <IconButton size="small" onClick={onClose} aria-label={t('liveCalls.closeDetail')}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <LiveRowFields row={row} />
    </Paper>
  );
};

// Listen, whisper, barge, hang up, and the rest under "more". Small in the
// grid; finger-sized on a phone card.
const SPY_ACTIONS = [
  { action: 'listen', Icon: HearingIcon, color: '#2196f3' },
  { action: 'whisper', Icon: RecordVoiceOverIcon, color: '#ff9800' },
  { action: 'barge', Icon: GroupsIcon, color: '#9c27b0' },
  { action: 'hangup', Icon: CallEndIcon, color: '#f44336' },
];
const CallActionButtons = ({ uuid, large, onAction, onMore }) => {
  const { t } = useTranslation('live');
  const size = large ? 'medium' : 'small';
  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
  return (
    <Box sx={{ display: 'flex', gap: large ? 1 : 0.25 }}>
      {SPY_ACTIONS.map(({ action, Icon, color }) => (
        <Tooltip key={action} title={t(`liveCalls.${action}`)}>
          <IconButton size={size} aria-label={t(`liveCalls.${action}`)} onClick={stop(() => onAction(uuid, action))} sx={{ color }}>
            <Icon fontSize={size} />
          </IconButton>
        </Tooltip>
      ))}
      <Tooltip title={t('liveCalls.more')}>
        <IconButton size={size} aria-label={t('liveCalls.more')} onClick={stop((e) => onMore(e.currentTarget, uuid))} sx={{ color: 'var(--mui-palette-text-secondary)' }}>
          <MoreVertIcon fontSize={size} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

/**
 * LiveCallsPanel — self-contained live-calls monitor. Extracted from the Home
 * (/live) "Live Calls" tab so it can pop out on the Calls screen. Grid + spy
 * actions + live chart; row click reveals an Events-style detail panel.
 */
const LiveCallsPanel = ({ open = true }) => {
  const { t } = useTranslation('live');
  const isPhone = useMediaQuery(useTheme().breakpoints.down('md'));
  // The actions change a call: the ACL's calls write grant, user or account.
  const canAct = usePermissions().can('calls', 'write');
  const { calls, columns: callColumns, loading, error, isNodeError, totalCount, refresh } = useLiveCalls(open);
  const { showSuccess, showError } = useNotification();
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [actionAnchor, setActionAnchor] = useState(null);
  const [actionUuid, setActionUuid] = useState(null);
  // Group-by: live breakdown of the current calls (counts per value); a group
  // chip click narrows the grid to that group.
  const [groupBy, setGroupBy] = useState(null);
  const [groupFilter, setGroupFilter] = useState(null);

  // Auto-refresh every 30s while open
  const timer = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    timer.current = setInterval(() => refresh(), 30000);
    return () => clearInterval(timer.current);
  }, [open, refresh]);

  const handleCallAction = useCallback(async (uuid, action) => {
    try {
      if (action === 'hangup') { await liveApi.hangupCall(uuid); showSuccess(t('liveCalls.terminated')); }
      else if (['listen', 'whisper', 'barge'].includes(action)) { await liveApi.spyCall(uuid, action); showSuccess(t('liveCalls.spyStarted', { action: t(`liveCalls.${action}`) })); }
      else { await liveApi.callAction(uuid, action); showSuccess(t('liveCalls.actionDone', { action: t(`liveCalls.${action}`) })); }
      setTimeout(() => refresh(), 1000);
    } catch (err) {
      showError(t('liveCalls.actionFailed', { message: err.message }));
    }
    setActionAnchor(null);
    setActionUuid(null);
  }, [refresh, showSuccess, showError, t]);

  const openMore = useCallback((anchor, uuid) => { setActionAnchor(anchor); setActionUuid(uuid); }, []);
  const actionsFor = useCallback((row, large) => {
    const uuid = row.uuid || row.call_uuid;
    return uuid ? <CallActionButtons uuid={uuid} large={large} onAction={handleCallAction} onMore={openMore} /> : null;
  }, [handleCallAction, openMore]);

  const actionsColumn = useMemo(() => ({
    field: '_actions', headerName: t('liveCalls.actions'), width: 180, sortable: false, filterable: false,
    renderCell: (params) => actionsFor(params.row, false),
  }), [actionsFor, t]);

  const columns = useMemo(() => (canAct ? [actionsColumn, ...callColumns] : callColumns), [canAct, actionsColumn, callColumns]);

  // The phone's cards: the same columns, placed by CARD_PRIORITY (the rest
  // are in the call's details), the actions along the bottom.
  const cardColumns = useMemo(() => [
    ...callColumns.map((column, index, all) => ({
      id: column.field,
      label: column.headerName,
      priority: cardPriority(column.field, index, all.map((c) => c.field)),
    })),
    ...(canAct ? [{ id: '_actions', label: t('liveCalls.actions'), priority: 'action', render: (row) => actionsFor(row, true) }] : []),
  ], [callColumns, canAct, actionsFor, t]);

  const filtered = useMemo(() => {
    let rows = calls;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((row) => Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(q)));
    }
    if (groupBy && groupFilter) {
      rows = rows.filter((row) => String(row[groupBy] ?? '—') === groupFilter);
    }
    return rows;
  }, [calls, search, groupBy, groupFilter]);

  // Counts per value of the group-by field, over ALL current live calls
  // (search applies, the group filter itself doesn't — so counts stay stable).
  const groupCounts = useMemo(() => {
    if (!groupBy) return [];
    const base = search
      ? calls.filter((row) => Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(search.toLowerCase())))
      : calls;
    const counts = new Map();
    base.forEach((row) => {
      const key = String(row[groupBy] ?? '—');
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [calls, search, groupBy]);

  // Clear a stale group filter when switching group-by
  useEffect(() => { setGroupFilter(null); }, [groupBy]);

  return (
    <Box>
      <LiveChartStrip
        chartType="live_calls"
        title={t('liveCalls.chartTitle')}
        series={[
          { field: 'incoming', name: t('liveCalls.incoming'), color: '#10b981' },
          { field: 'outgoing', name: t('liveCalls.outgoing'), color: '#8b5cf6' },
        ]}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder={t('liveCalls.filter')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 320 } }}
          InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ color: 'var(--mui-palette-text-secondary)' }} /></InputAdornment>) }}
        />
        <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', fontWeight: 600, ms: 1 }}>{t('liveCalls.groupBy')}</Typography>
        {GROUP_BY_FIELDS.map((field) => (
          <Chip
            key={field}
            label={t(`liveCalls.group.${field}`)}
            size="small"
            variant={groupBy === field ? 'filled' : 'outlined'}
            color={groupBy === field ? 'primary' : 'default'}
            onClick={() => setGroupBy((prev) => (prev === field ? null : field))}
            sx={{ cursor: 'pointer', fontWeight: groupBy === field ? 600 : 400 }}
          />
        ))}
      </Box>

      {/* Live breakdown of the current calls by the chosen field; clicking a
          group filters the grid to it (click again to clear). */}
      {groupBy && groupCounts.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {groupCounts.map(([value, count]) => (
            <Chip
              key={value}
              label={t('liveCalls.groupCount', { value, n: count })}
              size="small"
              variant={groupFilter === value ? 'filled' : 'outlined'}
              color={groupFilter === value ? 'secondary' : 'default'}
              onClick={() => setGroupFilter((prev) => (prev === value ? null : value))}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}

      {error && (
        <Alert severity={isNodeError ? 'info' : 'error'} sx={{ mb: 2 }} action={!isNodeError && <Button color="inherit" size="small" onClick={refresh}>{t('liveCalls.retry')}</Button>}>
          {isNodeError ? t('liveCalls.noNode') : error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {!loading && filtered.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, color: 'var(--mui-palette-text-secondary)', border: '1px dashed var(--mui-palette-divider)', borderRadius: 2, backgroundColor: 'var(--mui-palette-background-paper)' }}>
              <PhoneInTalkIcon sx={{ fontSize: 48, mb: 1, opacity: 0.35 }} />
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {search ? t('liveCalls.noMatch') : t('liveCalls.noCalls')}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: '#bbb' }}>
                {t('liveCalls.emptyHint')}
              </Typography>
            </Box>
          ) : isPhone ? (
            <ResponsiveTable
              columns={cardColumns}
              rows={filtered}
              loading={loading}
              getRowId={getRowId}
              onRowClick={setSelectedRow}
            />
          ) : (
            <Box sx={{ height: 'calc(100vh - 320px)', minHeight: 300 }}>
              <DataGrid
                rows={filtered}
                columns={columns}
                pageSize={50}
                rowsPerPageOptions={[25, 50, 100]}
                loading={loading}
                disableSelectionOnClick
                getRowId={getRowId}
                rowHeight={44}
                onRowClick={(params) => setSelectedRow(params.row)}
                sx={gridSx}
              />
            </Box>
          )}
          <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', mt: 0.5, display: 'block' }}>
            {search
              ? t('liveCalls.showing', { n: filtered.length, total: totalCount })
              : totalCount === 1 ? t('liveCalls.countOne') : t('liveCalls.count', { n: totalCount })}
          </Typography>
        </Box>
        {selectedRow && <LiveRowDetail row={selectedRow} asDialog={isPhone} onClose={() => setSelectedRow(null)} />}
      </Box>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={() => setActionAnchor(null)}>
        <MenuItem onClick={() => handleCallAction(actionUuid, 'mute')}><ListItemIcon><MicOffIcon fontSize="small" /></ListItemIcon><ListItemText>{t('liveCalls.mute')}</ListItemText></MenuItem>
        <MenuItem onClick={() => handleCallAction(actionUuid, 'unmute')}><ListItemIcon><MicIcon fontSize="small" /></ListItemIcon><ListItemText>{t('liveCalls.unmute')}</ListItemText></MenuItem>
        <MenuItem onClick={() => handleCallAction(actionUuid, 'hold')}><ListItemIcon><PauseIcon fontSize="small" /></ListItemIcon><ListItemText>{t('liveCalls.hold')}</ListItemText></MenuItem>
        <MenuItem onClick={() => handleCallAction(actionUuid, 'unhold')}><ListItemIcon><PlayArrowIcon fontSize="small" /></ListItemIcon><ListItemText>{t('liveCalls.unhold')}</ListItemText></MenuItem>
      </Menu>
    </Box>
  );
};

export default LiveCallsPanel;
