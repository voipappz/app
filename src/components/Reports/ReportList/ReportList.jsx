import React, { useState } from 'react';
import {
  List, ListItem, ListItemButton, ListItemText,
  CircularProgress, Alert, Box, IconButton, Tooltip,
  TextField, Typography, InputAdornment, Chip, Button,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import './ReportList.css';

const TYPE_COLOR = {
  table: 'default', line: 'primary', pie: 'secondary', bar: 'warning',
  scatter: 'info', map: 'success', counter: 'error', gauge: 'error',
};

const ReportList = ({ reports, loading, error, selectedReportUuid, onSelect, onCreateClick, onFork, onDelete, canWrite = true }) => {
  const { t } = useTranslation('reports');
  const [search, setSearch] = useState('');

  if (loading) return <CircularProgress sx={{ m: 2 }} size={20} />;
  if (error)   return <Alert severity="error" sx={{ m: 1, fontSize: 12 }}>{error}</Alert>;

  const filtered = (reports || []).filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1 }}>
      {/* Match the other resource screens: creation is a primary, visible action. */}
      {canWrite && (
        <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={onCreateClick}>
          {t('list.newReport')}
        </Button>
      )}

      {/* Search */}
      <TextField size="small" placeholder={t('list.search')} value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 14, color: 'text.disabled' }} /></InputAdornment>,
          sx: { fontSize: 12 },
        }}
        sx={{ flexShrink: 0 }}
      />

      {/* List */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0
          ? <Alert severity="info" sx={{ fontSize: 11 }}>{search ? t('list.noMatch') : t('list.empty')}</Alert>
          : (
            <List dense disablePadding>
              {filtered.map(r => (
                <ListItem key={r.uuid} disablePadding
                  secondaryAction={
                    canWrite && (
                      <Box sx={{ display: 'flex' }}>
                        {onFork && (
                          <Tooltip title={t('list.fork')}>
                            <IconButton edge="end" size="small"
                              aria-label={t('list.forkNamed', { name: r.name })}
                              onClick={e => { e.stopPropagation(); onFork(r.uuid); }}
                              sx={{ opacity: 0, '.MuiListItem-root:hover &': { opacity: 1 } }}>
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onDelete && r.editable !== false && (
                          <Tooltip title={t('list.delete')}>
                            <IconButton edge="end" size="small"
                              aria-label={t('list.deleteNamed', { name: r.name })}
                              onClick={e => { e.stopPropagation(); onDelete(r.uuid); }}
                              sx={{ opacity: 0, '.MuiListItem-root:hover &': { opacity: 1 }, color: 'error.main' }}>
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    )
                  }
                >
                  <ListItemButton selected={selectedReportUuid === r.uuid}
                    onClick={() => onSelect(r.uuid)}
                    sx={{ py: 0.5, pe: 4, borderRadius: 0.5 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" noWrap
                          sx={{ fontWeight: selectedReportUuid === r.uuid ? 600 : 400, fontSize: 13 }}>
                          {r.name}
                        </Typography>
                      }
                      secondary={(
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                          {r.source === 'template' && (
                            <Chip label={t('list.template')} size="small" variant="outlined"
                              sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }} />
                          )}
                          {r.type && r.type !== 'table' && (
                            <Chip label={t(`types.${r.type}`, { defaultValue: r.type })} size="small" color={TYPE_COLOR[r.type] || 'default'}
                              variant="outlined"
                              sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }} />
                          )}
                        </Box>
                      )}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )
        }
      </Box>

      {reports?.length > 5 && (
        <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', flexShrink: 0 }}>
          {filtered.length}/{reports.length}
        </Typography>
      )}
    </Box>
  );
};

export default ReportList;
