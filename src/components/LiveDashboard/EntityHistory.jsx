import { useMemo, useState } from 'react';
import { Box, Button, Chip, DialogContent, DialogTitle, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../ui';
import CdrResult from '../DashboardBuilder/CdrResult';
import { useCdrReport } from '../DashboardBuilder/useCdrReport';
import { useCdrCatalog } from '../DashboardBuilder/CdrEditor';
import { LIVE_RANGES } from '../DashboardBuilder/LiveWidgetEditor';

// Fields of the live document that are bookkeeping, not something to read.
const HIDDEN = new Set(['scope', 'id', 'environment_uuid', 'status_name', 'name']);
const KNOWN_STATUSES = new Set(['available', 'on_break', 'logged_out']);
const KNOWN_STATES = new Set(['waiting', 'receiving', 'ringing', 'answer', 'in_a_queue_call']);

function HistoryView({ title, hint, query, scope, catalog }) {
  const result = useCdrReport(query, { scope });
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      <Box sx={{ minHeight: 160, display: 'flex', flexDirection: 'column' }}>
        <CdrResult result={result} query={query} catalog={catalog} />
      </Box>
    </Box>
  );
}

/**
 * One live entity (an agent) and its past: the document the cable holds now,
 * and the same entity's rows in identities — filtered by type and id, in the
 * environment the document came from.
 */
export default function EntityHistory({ entity, onClose }) {
  const { t } = useTranslation('live');
  const { t: tw } = useTranslation('widgets');
  const [minutes, setMinutes] = useState(1440);
  const [counter, setCounter] = useState('');
  const scope = useMemo(() => ({ environmentUuids: entity?.environment_uuid ? [entity.environment_uuid] : [] }), [entity?.environment_uuid]);
  const catalog = useCdrCatalog('identity', scope);
  if (!entity) return null;

  const where = { type: [entity.scope], identity: [String(entity.id)] };
  const bucket = minutes > 1440 ? '1d' : '1h';
  const counters = (catalog.measures || []).filter((m) => String(m.key).startsWith('incr:'));
  const picked = counters.find((m) => m.key === counter) || counters[0];
  const name = entity.user_name || entity.name || entity.id;
  // The tenant's own status name first, then the words the agents table uses.
  const word = (k, v) => {
    if (k === 'status') return entity.status_name || (KNOWN_STATUSES.has(v) ? t(`status.${v}`) : v);
    if (k === 'state') return KNOWN_STATES.has(v) ? t(`state.${v}`) : v;
    return v;
  };
  const fields = Object.entries(entity).filter(([k, v]) => !HIDDEN.has(k) && v !== '' && v !== null && v !== undefined && typeof v !== 'object');

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="entity-history-title">
      <DialogTitle id="entity-history-title">{t('history.title', { name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
            {fields.map(([k, v]) => (
              <Box key={k} sx={{ minWidth: 0 }}>
                <Typography component="dt" variant="caption" color="text.secondary" noWrap>{t(`columns.${k}`, { defaultValue: t(`queues.${k}`, { defaultValue: k.replace(/_/g, ' ') }) })}</Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{String(word(k, v))}</Typography>
              </Box>
            ))}
          </Box>

          <ToggleButtonGroup size="small" exclusive value={minutes} onChange={(_, m) => m && setMinutes(m)} aria-label={tw('liveEditor.range')}>
            {LIVE_RANGES.map((m) => <ToggleButton key={m} value={m} sx={{ textTransform: 'none' }}>{tw(`liveEditor.ranges.${m}`)}</ToggleButton>)}
          </ToggleButtonGroup>

          <HistoryView title={t('history.overTime')} scope={scope} catalog={catalog}
            query={{ type: 'identity', measures: ['events'], dimensions: [], bucket, minutes, where, view: 'line' }} />
          <HistoryView title={t('history.topEvents')} scope={scope} catalog={catalog}
            query={{ type: 'identity', measures: ['events'], dimensions: ['event'], minutes, where, view: 'bar', limit: 10 }} />

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t('history.counters')}</Typography>
            {!counters.length ? (
              <Typography variant="body2" color="text.secondary">
                {catalog.failed ? t('history.countersUnavailable') : catalog.loaded ? t('history.noCounters') : '…'}
              </Typography>
            ) : (
              <>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 1 }}>
                  {counters.map((m) => (
                    <Chip key={m.key} component="button" clickable label={m.label} onClick={() => setCounter(m.key)}
                      color={picked?.key === m.key ? 'primary' : 'default'} variant={picked?.key === m.key ? 'filled' : 'outlined'} />
                  ))}
                </Box>
                {picked && (
                  <HistoryView title={picked.label} hint={t('history.countersHint')} scope={scope} catalog={catalog}
                    query={{ type: 'identity', measures: [picked.key], dimensions: [], bucket, minutes, where, view: 'line' }} />
                )}
              </>
            )}
          </Box>
          <Box><Button onClick={onClose}>{tw('widget.close')}</Button></Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
