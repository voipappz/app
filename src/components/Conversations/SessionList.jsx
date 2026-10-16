import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Avatar, Box, ButtonBase, Chip, CircularProgress, IconButton, InputAdornment, ListSubheader, Menu, MenuItem, Tab, Tabs, TextField, Typography, useTheme } from '@mui/material';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';
import DateRangeControl from './DateRangeControl.jsx';
import { rowNumberSx, rowPrimarySx, rowSecondarySx } from './sessionRowStyles';
import { SORTS } from './viewOptions';
import Bdi from '../../i18n/Bdi';
import { formatOnlyDate, formatTime } from '../../utils/dateUtils';

const TABS = ['all', 'missed'];

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

const initialOf = (s) => ((s.contact?.name || '').trim()[0] || '').toUpperCase();

/** Left pane: Saved history: All / Missed. The selected row is highlighted. */
export default function SessionList({ tab, onTab, sessions, selectedId, onSelect, loading, error, search, onSearch, view, onView, canEveryone }) {
  const { t } = useTranslation('conversations');
  const empty = !loading && sessions.length === 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Tabs value={tab} onChange={(_, v) => onTab(v)} variant="fullWidth" sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((k) => <Tab key={k} value={k} label={t(`tabs.${k}`)} sx={{ minHeight: 40, textTransform: 'none' }} />)}
      </Tabs>
      <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
          size="small" fullWidth type="search" value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder={t('search.placeholder')}
          inputProps={{ 'aria-label': t('search.label'), dir: 'ltr', inputMode: 'tel', style: { textAlign: 'start' } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
          <DateRangeControl from={view.from || ''} to={view.to || ''} onChange={(range) => onView(range)} />
          <ViewMenu view={view} onView={onView} canEveryone={canEveryone} t={t} />
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={22} /></Box>}
        {error && <Typography role="alert" variant="body2" color="error" sx={{ p: 2 }}>{t('list.error')}</Typography>}
        {empty && !error && (
          <Box sx={{ px: 3, py: 5, textAlign: 'center', color: 'text.secondary' }}>
            <ForumOutlinedIcon sx={{ fontSize: 28, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2">{t(`list.empty.${tab}`)}</Typography>
          </Box>
        )}
        {sessions.map((s) => {
          const on = s.call_uuid === selectedId;
          const title = s.contact?.name || s.remote_number || s.agent_name || t(`direction.${s.direction || 'unknown'}`, { defaultValue: '—' });
          return (
            <ButtonBase
              key={s.call_uuid} onClick={() => onSelect(s.call_uuid)} aria-current={on ? 'true' : undefined}
              data-testid="session-row"
              sx={(theme) => ({
                display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', gap: 1.25, alignItems: 'center', width: '100%',
                textAlign: 'start', px: 2, py: 2, borderBottom: 1, borderColor: 'divider',
                borderInlineStart: '3px solid', borderInlineStartColor: on ? 'primary.main' : 'transparent',
                bgcolor: on ? alpha(theme.palette.primary.main, 0.07) : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
                '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              })}
            >
              <Avatar sx={{ width: 38, height: 38, fontSize: 14, bgcolor: 'action.selected', color: 'text.secondary' }}>{initialOf(s) || <PhoneOutlinedIcon sx={{ fontSize: 18 }} />}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ ...rowPrimarySx, fontSize: 14, fontWeight: on ? 600 : 500 }}><Bdi>{title}</Bdi></Typography>
                <Typography noWrap sx={rowSecondarySx}>
                  {t(`direction.${s.direction || 'unknown'}`, { defaultValue: '' })}
                  {s.outcome && !isBot(s) ? ` · ${t(`outcome.${s.outcome}`, { defaultValue: '' })}` : ''}
                </Typography>
                {isBot(s) && <Chip size="small" label={t('outcome.bot')} sx={{ ms: 0.5, height: 16, fontSize: 10 }} />}
              </Box>
              <Typography sx={{ ...rowSecondarySx, ...rowNumberSx, gridColumn: 2, mt: -0.5, fontSize: 11, color: 'text.secondary' }}>
                {s.started_at ? <><Bdi>{formatOnlyDate(s.started_at)}</Bdi>{' · '}<Bdi>{formatTime(s.started_at)}</Bdi></> : ''}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
