import { useTranslation } from 'react-i18next';
import { Avatar, Box, ButtonBase, CircularProgress, Tab, Tabs, Typography } from '@mui/material';
import Bdi from '../../i18n/Bdi';
import { formatTime } from '../../utils/dateUtils';

const TABS = ['live', 'all', 'missed'];

const initialOf = (s) => ((s.contact?.name || '').trim()[0] || '?').toUpperCase();

/** Left pane: Live / All / Missed. The selected row is highlighted. */
export default function SessionList({ tab, onTab, sessions, selectedId, onSelect, loading, error, liveConnected }) {
  const { t } = useTranslation('conversations');
  const empty = !loading && sessions.length === 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Tabs value={tab} onChange={(_, v) => onTab(v)} variant="fullWidth" sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((k) => <Tab key={k} value={k} label={t(`tabs.${k}`)} sx={{ minHeight: 40, textTransform: 'none' }} />)}
      </Tabs>
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
          const title = s.contact?.name || s.remote_number || '—';
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
                  {s.outcome ? ` · ${s.outcome}` : ''}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: s.live ? 'success.main' : 'text.secondary' }}>
                {s.live ? t('list.live') : (s.started_at ? formatTime(s.started_at) : '')}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
