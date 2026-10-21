import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Chip, CircularProgress, IconButton, Tooltip, TextField,
  Select, MenuItem, Button, InputAdornment,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../utils/dateUtils';
import { notificationsApi } from '../../services/api/notificationsApi';
import { refreshNavBadges } from '../../hooks/useNavBadges';

/**
 * The Monitoring right rail: unread alerts, full height.
 *
 * An alert is a Notification row of type 'alert' (threshold breaches from
 * config/alerts.yaml), so the rail reads /api/notifications as it is:
 *   - list:   GET ?type=alert&action=pending[&level=][&search[inline]=]
 *             — the level filter and the search run in the API;
 *   - counts: the X-Total of that list, per level;
 *   - read:   PATCH /api/notifications/:uuid?action=read.
 * The API orders newest first only, so "Oldest" and "Severity" order here.
 *
 * Marking in bulk needs a filter (a level or a search): "Mark N read" acts on
 * exactly the rows shown. There is deliberately no unfiltered "mark all" — one
 * click clearing every alert, criticals included, is how one gets missed.
 */

const LEVEL_COLOR = { critical: '#dc2626', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
const LEVELS = ['critical', 'error', 'warning', 'info'];
const SEVERITY = { critical: 0, error: 1, warning: 2, info: 3 };
const REFRESH_MS = 30000;
const time = (a) => new Date(a.timestamp).getTime() || 0;
const SORTS = {
  newest: (a, b) => time(b) - time(a),
  oldest: (a, b) => time(a) - time(b),
  severity: (a, b) => (SEVERITY[a.level] ?? 9) - (SEVERITY[b.level] ?? 9) || time(b) - time(a),
};
const toAlert = (n) => ({ ...n, id: n.uuid, level: n.level, subject: n.subject, message: n.msg, timestamp: n.created_at });

const SectionHeader = ({ icon, title, right }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
    {icon}
    <Typography variant="caption" sx={{
      fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
      fontSize: '0.68rem', color: 'var(--theme-text-secondary)', flex: 1,
    }}>
      {title}
    </Typography>
    {right}
  </Box>
);

const Empty = ({ children }) => (
  <Typography variant="caption" sx={{ color: 'var(--theme-text-secondary)', fontStyle: 'italic', fontSize: '0.72rem' }}>
    {children}
  </Typography>
);

const MonitoringSidebar = ({ notificationType = 'alert', onSelect, onCountChange }) => {
  const { t } = useTranslation('notifications');
  const isAlert = notificationType === 'alert';
  const [level, setLevel] = useState('');        // '' = every level
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');      // the query, once typing pauses
  const [sort, setSort] = useState('newest');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});      // { all, critical, error, warning, info }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const [list, ...totals] = await Promise.allSettled([
      notificationsApi.getUnreadAlerts({ level, search, type: notificationType }),
      notificationsApi.countUnreadAlerts('', notificationType),
      ...LEVELS.map(l => notificationsApi.countUnreadAlerts(l, notificationType)),
    ]);
    if (list.status === 'fulfilled') setRows(list.value.rows.map(toAlert));
    const n = (r) => (r.status === 'fulfilled' ? r.value : 0);
    setCounts({ all: n(totals[0]), ...Object.fromEntries(LEVELS.map((l, i) => [l, n(totals[i + 1])])) });
    if (totals[0].status === 'fulfilled') onCountChange?.(totals[0].value);
    setLoading(false);
  }, [level, search, notificationType, onCountChange]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const shown = useMemo(() => [...rows].sort(SORTS[sort]), [rows, sort]);
  const filtered = !!(level || search);

  const markRead = async (ids) => {
    if (!ids.length) return;
    setBusy(true);
    await Promise.allSettled(ids.map(id => notificationsApi.markRead(id)));
    await load();
    setBusy(false);
    refreshNavBadges();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <SectionHeader
        icon={<NotificationsActiveIcon sx={{ fontSize: 16, color: counts.all ? '#ef4444' : 'var(--theme-text-secondary)' }} />}
        title={t(isAlert ? 'list.alerts' : 'list.notifications', { n: counts.all ?? 0 })}
        right={filtered && shown.length > 0 && (
          <Tooltip title={t('list.markShownRead')}>
            <span>
              <Button size="small" startIcon={<DoneAllIcon sx={{ fontSize: 14 }} />} disabled={busy}
                onClick={() => markRead(shown.map(a => a.id))} data-testid="alerts-mark-filtered"
                sx={{ textTransform: 'none', fontSize: '0.68rem', minWidth: 0, py: 0 }}>
                {t('list.markNRead', { n: shown.length })}
              </Button>
            </span>
          </Tooltip>
        )}
      />

      {/* Filter by level (each chip is its unread count), search, order */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        <Chip label={t('list.all', { n: counts.all ?? 0 })} size="small" onClick={() => setLevel('')} data-testid="alerts-level-all"
          variant={level ? 'outlined' : 'filled'} sx={{ height: 20, fontSize: '0.64rem' }} />
        {LEVELS.filter(l => counts[l] > 0 || level === l).map(l => (
          <Chip key={l} label={t(`list.level.${l}`, { n: counts[l] ?? 0 })} size="small" onClick={() => setLevel(level === l ? '' : l)}
            data-testid={`alerts-level-${l}`}
            sx={{
              height: 20, fontSize: '0.64rem', textTransform: 'capitalize',
              color: level === l ? '#fff' : LEVEL_COLOR[l],
              bgcolor: level === l ? LEVEL_COLOR[l] : `${LEVEL_COLOR[l]}20`,
              '&:hover': { bgcolor: level === l ? LEVEL_COLOR[l] : `${LEVEL_COLOR[l]}35` },
            }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
        <TextField size="small" placeholder={t(isAlert ? 'list.searchAlerts' : 'list.searchNotifications')} value={query} onChange={e => setQuery(e.target.value)}
          inputProps={{ 'aria-label': t(isAlert ? 'list.searchAlerts' : 'list.searchNotifications'), style: { fontSize: '0.72rem', padding: '4px 6px' } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 14 }} /></InputAdornment> }}
          sx={{ flex: 1 }} />
        <Select size="small" value={sort} onChange={e => setSort(e.target.value)}
          inputProps={{ 'aria-label': t('list.order') }} sx={{ fontSize: '0.7rem', '& .MuiSelect-select': { py: '4px' } }}>
          <MenuItem value="newest">{t('list.newest')}</MenuItem>
          <MenuItem value="oldest">{t('list.oldest')}</MenuItem>
          <MenuItem value="severity">{t('list.severity')}</MenuItem>
        </Select>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? <CircularProgress size={16} />
          : !shown.length ? <Empty>{filtered
            ? t(isAlert ? 'list.noAlertsMatch' : 'list.noNotificationsMatch')
            : t(isAlert ? 'list.nothingAboveThreshold' : 'list.noUnread')}</Empty>
          : shown.map(a => (
            <Box key={a.id} data-testid="alert-row" sx={{
              py: 0.75, borderBottom: '1px solid var(--theme-border)',
              borderInlineStart: `3px solid ${LEVEL_COLOR[a.level] || '#9ca3af'}`, ps: 1,
              display: 'flex', alignItems: 'flex-start', gap: 0.5,
            }}>
              <Box
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={() => onSelect?.(a)}
                onKeyDown={event => {
                  if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onSelect(a);
                  }
                }}
                sx={{ flex: 1, minWidth: 0, cursor: onSelect ? 'pointer' : 'default' }}
              >
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                  {a.subject || a.level}
                </Typography>
                {a.message && a.message !== a.subject && (
                  <Typography sx={{ fontSize: '0.7rem', color: 'var(--theme-text-secondary)' }}>
                    {a.message}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.62rem', color: 'var(--theme-text-secondary)' }}>
                  {formatDate(a.timestamp)}
                </Typography>
              </Box>
              <Tooltip title={t('list.markAsRead')}>
                <span>
                  <IconButton size="small" disabled={busy} onClick={() => markRead([a.id])}
                    aria-label={t('list.markItemRead', { subject: a.subject || a.level })}>
                    <DoneIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
      </Box>
    </Box>
  );
};

export default MonitoringSidebar;
