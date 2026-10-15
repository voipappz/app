import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Divider, IconButton, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import TuneIcon from '@mui/icons-material/Tune';
import Bdi from '../../../i18n/Bdi';
import { formatClock } from '../callFormat';

// The keys Mediators::Cdr::Router writes into calls.profile that have a name
// people read. Listed in reading order; any other key follows, sorted, under
// its raw name — a field the API adds shows up without a release here.
export const PROFILE_LABELS = [
  'state', 'disposition', 'duration', 'caller', 'callee', 'caller_id_number',
  'contact_name', 'user_name', 'extension_name', 'did_name', 'queue_name',
  'campaign_name', 'environment_name', 'provider_name', 'provider_status',
  'tariff_name', 'sip_call_id', 'sip_user_agent', 'sip_network_ip',
  'remote_media_ip', 'codecs', 'read_codec', 'write_codec', 'rtp_audio_in_mos',
  'rtp_audio_in_quality_percentage', 'timezone', 'domain',
];

// Already shown in the rows above the section (Direction, Status, CID,
// Contact, Provider, Hangup, Talk time) — listed once, not twice.
const SHOWN_ABOVE = new Set(['direction', 'cause', 'cid', 'contact', 'provider', 'hangup_disposition', 'talk_duration']);

// Never on screen: internal keys (leading underscore) and anything that
// names a credential.
const HIDDEN = (key) => key.startsWith('_') || /(password|secret|token)|(^|_)key$/i.test(key);

const COPYABLE = (key) => /(^|_)(uuid|id)$/.test(key)
  || ['sip_call_id', 'caller', 'callee', 'caller_id_number'].includes(key);

const display = (key, value) => {
  if (/duration$/.test(key)) return formatClock(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// The visible rows of a call's profile: [{ key, label?, value, copyable }].
export const profileRows = (profile) => {
  if (!profile || typeof profile !== 'object') return [];
  const known = new Map(PROFILE_LABELS.map((key, index) => [key, index]));
  return Object.entries(profile)
    .filter(([key, value]) => !SHOWN_ABOVE.has(key) && !HIDDEN(key)
      && value !== null && value !== undefined && String(value).trim() !== '')
    .sort(([a], [b]) => {
      const ia = known.has(a) ? known.get(a) : Infinity;
      const ib = known.has(b) ? known.get(b) : Infinity;
      return ia === ib ? a.localeCompare(b) : ia - ib;
    })
    .map(([key, value]) => ({
      key,
      known: known.has(key),
      raw: typeof value === 'object' ? JSON.stringify(value) : String(value),
      value: display(key, value),
      copyable: COPYABLE(key),
    }));
};

const CopyButton = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation('calls');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <Tooltip title={copied ? t('profile.copied') : t('profile.copy')}>
      <IconButton size="small" onClick={copy} aria-label={t('profile.copyField', { field: label })} sx={{ p: 0.25 }}>
        {copied
          ? <CheckIcon sx={{ fontSize: 13, color: 'var(--color-success)' }} />
          : <ContentCopyIcon sx={{ fontSize: 13, color: 'var(--text-tertiary)' }} />}
      </IconButton>
    </Tooltip>
  );
};

// The call's profile — what the switch recorded about it — as a compact
// key/value list. Empty values are left out.
const CallProfile = ({ profile }) => {
  const { t } = useTranslation('calls');
  const rows = profileRows(profile);
  if (!rows.length) return null;

  return (
    <>
    <Divider sx={{ mt: 1 }} />
    <Box data-testid="call-profile" sx={{ px: 2, pb: 1 }}>
      <Box sx={{ pt: 1.5, pb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <TuneIcon sx={{ fontSize: 18, color: 'var(--text-secondary)' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontFamily: 'Rubik, sans-serif', color: 'var(--text-primary)' }}>
          {t('profile.title')}
        </Typography>
      </Box>
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(92px, max-content) minmax(0, 1fr)',
          columnGap: 1.5,
          fontSize: '0.78rem',
          '& > dt, & > dd': { py: 0.5, borderBottom: '1px solid var(--bg-tertiary)', m: 0 },
        }}
      >
        {rows.map((row) => {
          const label = row.known ? t(`profile.fields.${row.key}`, { defaultValue: row.key }) : row.key;
          return (
            <React.Fragment key={row.key}>
              <Box component="dt" title={row.key} sx={{ color: 'var(--text-secondary)', fontWeight: 500, fontFamily: row.known ? 'Rubik, sans-serif' : '"JetBrains Mono", Consolas, monospace' }}>
                {label}
              </Box>
              <Box component="dd" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Box component="span" sx={{ color: 'var(--text-primary)', fontFamily: '"JetBrains Mono", Consolas, monospace', wordBreak: 'break-all' }}>
                  <Bdi>{row.value}</Bdi>
                </Box>
                {row.copyable && <CopyButton text={row.raw} label={label} />}
              </Box>
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
    </>
  );
};

export default CallProfile;
