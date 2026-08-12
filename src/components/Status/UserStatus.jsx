import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, FormControl, MenuItem, Paper, Select, Stack, Typography,
} from '@mui/material';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { listAgentStatuses, listBreakReasons, listLiveAgents, setAgentStatus } from '../../services/agentStatusApi';
import { findCurrentUserStatus, formatStatusTime } from './userStatus';

const POLL_MS = 10_000;

function Metric({ icon, label, value, detail }) {
  return (
    <Paper elevation={0} sx={{ p: 2.25, border: '1px solid', borderColor: 'divider', borderRadius: 3, minWidth: 0 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: 'action.hover', color: 'primary.main' }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 750, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{value || '—'}</Typography>
          {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function UserStatus() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [breakReasons, setBreakReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const liveRows = await listLiveAgents();
      setRows(Array.isArray(liveRows) ? liveRows : []);
      setError('');
    } catch (reason) {
      setError(reason?.message || t('userStatus.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let alive = true;
    Promise.all([listAgentStatuses(), listBreakReasons()])
      .then(([nextStatuses, nextBreakReasons]) => {
        if (alive) { setStatuses(nextStatuses); setBreakReasons(nextBreakReasons); }
      })
      .catch(() => {});
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [load]);

  const current = useMemo(() => findCurrentUserStatus(rows, user), [rows, user]);
  const options = statuses.flatMap((status) => status.type === 'on_break' && breakReasons.length
    ? breakReasons.map((reason) => ({ value: `${status.type}:${reason.name}`, label: `${status.label} — ${reason.name}` }))
    : [{ value: status.type, label: status.label }]);
  const currentValue = options.some((option) => option.value === current?.availabilityType)
    ? current.availabilityType
    : '';

  const changeStatus = async (event) => {
    const [type, name] = String(event.target.value).split(':');
    const userUuid = user?.user_uuid || user?.id || user?.raw?.uuid || current?.uuid;
    setSaving(true);
    setError('');
    try {
      await setAgentStatus(userUuid, type, name);
      await load();
    } catch (reason) {
      setError(reason?.message || t('userStatus.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1040, mx: 'auto' }} data-testid="user-status">
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 750 }}>{t('userStatus.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('userStatus.subtitle')}</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 230 }}>
          <Select
            value={currentValue}
            onChange={changeStatus}
            displayEmpty
            disabled={loading || saving || !options.length}
            inputProps={{ 'aria-label': t('userStatus.availability') }}
            data-testid="user-status-select"
            renderValue={(value) => saving
              ? t('userStatus.saving')
              : options.find((option) => option.value === value)?.label || current?.availability || t('userStatus.availability')}
          >
            {options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>}
      {!loading && !current && <Alert severity="info">{t('userStatus.notFound')}</Alert>}

      {current && <>
        <Paper elevation={0} sx={{ p: 2.5, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">{t('userStatus.availability')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 750 }}>{current.availability}</Typography>
            </Box>
            <Chip label={current.state} color={/answer|call/i.test(current.state) ? 'success' : /ring/i.test(current.state) ? 'warning' : 'default'} />
          </Stack>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <Metric icon={<QueryStatsOutlinedIcon />} label={t('userStatus.calls')} value={String(current.callCount)} detail={t('userStatus.sinceLogin')} />
          <Metric icon={<ScheduleOutlinedIcon />} label={t('userStatus.lastCall')} value={formatStatusTime(current.lastCallAt, i18n.language)} />
          <Metric icon={<PhoneInTalkOutlinedIcon />} label={t('userStatus.talkingTo')} value={current.talkingTo} />
          <Metric icon={<SupportAgentOutlinedIcon />} label={t('userStatus.activeQueue')} value={current.queue} />
        </Box>

        {current.updatedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            {t('userStatus.updated')}: {formatStatusTime(current.updatedAt, i18n.language)}
          </Typography>
        )}
      </>}
    </Box>
  );
}
