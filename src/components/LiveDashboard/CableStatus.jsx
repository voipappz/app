import React, { useState } from 'react';
import { Box, Paper, Typography, Collapse, IconButton, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import Bdi from '../../i18n/Bdi';
import { formatTime } from '../../utils/dateUtils';

import { cableVerdict, STALE_AFTER_MS } from '../../services/cable';

/**
 * CableStatus — is this screen live, and if not, why.
 *
 * Everything here is what the page's own socket went through, not a second
 * probe: the handshake, the heartbeat, the subscription the screen depends on,
 * and whether data is arriving. The verdict is one line; the details open by
 * themselves when it is not green, because that is when someone needs them.
 */

const LEVEL_COLOR = {
  ok: 'success.main',
  warn: 'warning.main',
  error: 'error.main',
  idle: 'text.disabled',
};

const TOKEN_SOURCES = ['admin', 'portal', 'override'];
const SUB_STATUSES = ['idle', 'unavailable', 'pending', 'confirmed', 'reconnecting', 'disconnected', 'rejected'];

// The time phrases, in the active language (live.json cable.time).
const time = (key, values) => i18n.t(`live:cable.time.${key}`, values);

export function ago(ts, now) {
  if (!ts) return time('never');
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return time('secondsAgo', { s });
  if (s < 3600) return time('minutesAgo', { m: Math.floor(s / 60), s: s % 60 });
  return time('hoursAgo', { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
}

function until(ts, now) {
  if (!ts) return time('noExpiry');
  const s = Math.round((ts - now) / 1000);
  if (s <= 0) return time('expired');
  if (s < 3600) return time('expiresMinutes', { m: Math.floor(s / 60) });
  if (s < 86400) return time('expiresHours', { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  return time('expiresDays', { d: Math.floor(s / 86400) });
}

const clock = (ts) => (ts ? formatTime(ts, true) : '—');

// A detail line's parts, the ones that apply, as one line.
const parts = (...items) => items.filter(Boolean).join(' · ');

function Row({ label, children, tone }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: { xs: 0, sm: 2 }, py: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', wordBreak: 'break-all', color: tone || 'text.primary' }}>
        {children}
      </Typography>
    </Box>
  );
}

export default function CableStatus({ conn, sub, counts = {}, now = Date.now() }) {
  const { t } = useTranslation('live');
  const verdict = cableVerdict(conn, sub, now);
  const healthy = verdict.level === 'ok';
  const [open, setOpen] = useState(null); // null = follow health
  const expanded = open ?? !healthy;

  const pingAge = conn.pingedAt ? now - conn.pingedAt : null;
  const pingTone = pingAge !== null && pingAge > STALE_AFTER_MS ? 'warning.main' : undefined;
  const frames = sub?.frames ?? 0;
  const subStatus = SUB_STATUSES.includes(sub?.status) ? t(`cable.sub.${sub.status}`) : (sub?.status || '—');

  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, borderColor: healthy ? 'divider' : LEVEL_COLOR[verdict.level] }} data-testid="cable-status">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Box
          aria-hidden
          sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: LEVEL_COLOR[verdict.level], flexShrink: 0 }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {t('cable.title', { verdict: verdict.label })}
        </Typography>
        {healthy && (
          <Typography variant="caption" color="text.secondary">
            {sub?.lastFrameAt
              ? t('cable.healthyLast', { ping: ago(conn.pingedAt, now), n: frames, last: ago(sub.lastFrameAt, now) })
              : t('cable.healthy', { ping: ago(conn.pingedAt, now), n: frames })}
          </Typography>
        )}
        {verdict.hint && (
          <Typography variant="caption" sx={{ color: LEVEL_COLOR[verdict.level] }}>{verdict.hint}</Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={expanded ? t('cable.hideDetails') : t('cable.showDetails')}>
          <IconButton size="small" onClick={() => setOpen(!expanded)} aria-label={t('cable.detailsLabel')}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Row label={t('cable.row.endpoint')}>{conn.url ? <Bdi>{conn.url}</Bdi> : t('cable.notConfigured')}</Row>
          <Row label={t('cable.row.token')} tone={conn.tokenExpiresAt && conn.tokenExpiresAt <= now ? 'error.main' : undefined}>
            {parts(
              TOKEN_SOURCES.includes(conn.tokenSource) ? t(`cable.tokenSource.${conn.tokenSource}`) : t('cable.noToken'),
              until(conn.tokenExpiresAt, now),
            )}
          </Row>
          <Row label={t('cable.row.socket')}>
            {parts(
              conn.state,
              conn.openedAt && t('cable.opened', { time: clock(conn.openedAt) }),
              !conn.monitorRunning && conn.state !== 'idle' && t('cable.notReconnecting'),
            )}
          </Row>
          <Row label={t('cable.row.handshake')} tone={conn.welcomedAt ? undefined : 'text.secondary'}>
            {conn.welcomedAt ? t('cable.welcome', { time: clock(conn.welcomedAt) }) : t('cable.noWelcome')}
          </Row>
          <Row label={t('cable.row.heartbeat')} tone={pingTone}>
            {parts(
              conn.pingedAt ? t('cable.lastPing', { ago: ago(conn.pingedAt, now) }) : t('cable.noPing'),
              t('cable.staleAfter', { s: STALE_AFTER_MS / 1000 }),
            )}
          </Row>
          <Row label={t('cable.row.subscription')} tone={sub?.status === 'rejected' ? 'error.main' : undefined}>
            {parts(
              'LiveChannel',
              sub?.environmentUuid,
              sub?.confirmedAt ? t('cable.statusAt', { status: subStatus, time: clock(sub.confirmedAt) }) : subStatus,
            )}
          </Row>
          <Row label={t('cable.row.data')}>
            {parts(
              t('cable.updates', { n: frames }),
              t('cable.last', { ago: ago(sub?.lastFrameAt, now) }),
              t('cable.counts', { agents: counts.user ?? 0, queues: counts.queue ?? 0, environments: counts.environment ?? 0 }),
            )}
          </Row>
          <Row label={t('cable.row.reconnects')} tone={conn.reconnectAttempts ? 'warning.main' : undefined}>
            {parts(
              conn.reconnectAttempts === 1 ? t('cable.attemptOne') : t('cable.attempts', { n: conn.reconnectAttempts }),
              conn.lastCloseAt && t('cable.lastClose', { ago: ago(conn.lastCloseAt, now), code: conn.lastCloseCode ?? '?' }),
              conn.disconnectReason && t('cable.serverSaid', { reason: conn.disconnectReason }),
            )}
          </Row>
        </Box>
      </Collapse>
    </Paper>
  );
}
