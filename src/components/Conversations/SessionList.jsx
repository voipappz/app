import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Avatar, Box, ButtonBase, Chip, CircularProgress, IconButton, InputAdornment, ListSubheader, Menu, MenuItem, Tab, Tabs, TextField, Typography, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';
import { SORTS } from './viewOptions';
import Bdi from '../../i18n/Bdi';
import { formatTime } from '../../utils/dateUtils';

const TABS = ['live', 'all', 'missed'];

const elapsed = (from, now) => {
  const sec = from ? Math.max(0, Math.floor((now - Date.parse(from)) / 1000)) : null;
  return sec === null ? '' : `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};
const isBot = (s) => s.outcome === 'bot' || s.leg_b_type === 'vml';
const OUTCOMES = ['answered', 'missed', 'bot'];
const DIRECTIONS = ['incoming', 'outgoing'];

/** One small menu: sort, direction, outcome (and Everyone when allowed). */
function ViewMenu({ view, onView, canEveryone, t }) {
  const [anchor, setAnchor] = useState(null);
  const rtl = useTheme().direction === 'rtl';
  const item = (label, selected, onClick) => <MenuItem dense key={label} selected={selected} onClick={onClick}>{label}</MenuItem>;
  return (
    <>
      <IconButton size="small" aria-label={t('view.menu')} onClick={(e) => setAnchor(e.currentTarget)}><SortIcon fontSize="small" /></IconButton>
      <Menu
        open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: rtl ? 'left' : 'right' }} transformOrigin={{ vertical: 'top', horizontal: rtl ? 'left' : 'right' }}
      >
        <ListSubheader disableSticky>{t('view.sortBy')}</ListSubheader>
        {Object.keys(SORTS).map((k) => item(t(`view.sort.${k}`), view.sort === k, () => onView({ sort: k })))}
        <ListSubheader disableSticky>{t('view.direction')}</ListSubheader>
        {item(t('view.all'), !view.direction, () => onView({ direction: '' }))}
        {DIRECTIONS.map((k) => item(t(`direction.${k}`), view.direction === k, () => onView({ direction: k })))}
        <ListSubheader disableSticky>{t('view.outcome')}</ListSubheader>
        {item(t('view.all'), !view.outcome, () => onView({ outcome: '' }))}
        {OUTCOMES.map((k) => item(t(`outcome.${k}`), view.outcome === k, () => onView({ outcome: k })))}
        {canEveryone && <ListSubheader disableSticky>{t('view.scope')}</ListSubheader>}
        {canEveryone && item(t('view.mine'), !view.everyone, () => onView({ everyone: false }))}
        {canEveryone && item(t('view.everyone'), view.everyone, () => onView({ everyone: true }))}
      </Menu>
    </>
  );
}

const initialOf = (s) => ((s.contact?.name || '').trim()[0] || '?').toUpperCase();

/** Left pane: Live / All / Missed. The selected row is highlighted. */
export default function SessionList({ tab, onTab, sessions, selectedId, onSelect, loading, error, liveConnected, search, onSearch, view, onView, canEveryone }) {
  const { t } = useTranslation('conversations');
  const [now, setNow] = useState(() => Date.now());
  const anyLive = sessions.some((x) => x.live);
  useEffect(() => {
    if (!anyLive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyLive]);
  const empty = !loading && sessions.length === 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Tabs value={tab} onChange={(_, v) => onTab(v)} variant="fullWidth" sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((k) => <Tab key={k} value={k} label={t(`tabs.${k}`)} sx={{ minHeight: 40, textTransform: 'none' }} />)}
      </Tabs>
      <Box sx={{ px: 1.25, py: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TextField
          size="small" fullWidth type="search" value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder={t('search.placeholder')}
          inputProps={{ 'aria-label': t('search.label'), dir: 'ltr', inputMode: 'tel', style: { textAlign: 'start' } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <ViewMenu view={view} onView={onView} canEveryone={canEveryone} t={t} />
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={22} /></Box>}
        {error && <Typography role="alert" variant="body2" color="error" sx={{ p: 2 }}>{t('list.error')}</Typography>}
        {empty && !error && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            {tab === 'live' && !liveConnected ? t('list.notLive') : t(`list.empty.${tab}`)}
          </Typography>
        )}
        {sessions.map((s) => {
          const on = s.call_uuid === selectedId;
          const title = s.contact?.name || s.agent_name || s.remote_number || t(`direction.${s.direction || 'unknown'}`, { defaultValue: '—' });
          return (
            <ButtonBase
              key={s.call_uuid} onClick={() => onSelect(s.call_uuid)} aria-current={on ? 'true' : undefined}
              data-testid="session-row"
              sx={{
                display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 1.25, alignItems: 'center', width: '100%',
                textAlign: 'start', px: 1.75, py: 1.25, borderBottom: 1, borderColor: 'divider',
                bgcolor: on ? 'action.selected' : 'transparent',
              }}
            >
              <Avatar sx={{ width: 32, height: 32, fontSize: 12 }}>{initialOf(s)}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 500, fontSize: 13 }}><Bdi>{title}</Bdi></Typography>
                <Typography noWrap variant="caption" color="text.secondary">
                  {t(`direction.${s.direction || 'unknown'}`, { defaultValue: '' })}
                  {s.outcome && !isBot(s) ? ` · ${t(`outcome.${s.outcome}`, { defaultValue: '' })}` : ''}
                </Typography>
                {isBot(s) && <Chip size="small" label={t('outcome.bot')} sx={{ ms: 0.5, height: 16, fontSize: 10 }} />}
              </Box>
              <Typography variant="caption" sx={{ color: s.live ? 'success.main' : 'text.secondary' }}>
                {s.live ? (elapsed(s.started_at, now) || t('list.live')) : (s.started_at ? formatTime(s.started_at) : '')}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
