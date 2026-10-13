// PhonePresence — the agent-status pill in the phone panel header, as the
// legacy portal had ("Available ▾").
//
// The platform owns the vocabulary: GET /api/statuses/agent_statuses returns
// { wire_key: 'Label' } from Agent::STATUSES_MAPPINGS, and that endpoint
// exists specifically so an agent on the USER surface can render this picker.
// Verified live, it currently returns:
//   logged_out, available, available_on_demand, on_break
// Setting publishes via PATCH /api/users/:uuid?action=status, which validates
// against those same keys.
//
// "Do not disturb" is deliberately NOT one of them: it's local softphone
// behaviour (reject incoming) and publishes nothing to the platform.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, Select, Typography, Box } from '@mui/material';
import { statusesApi } from '../../services/api/statusesApi';
import { GREEN, MUTED } from './panelTheme.js';

const DND = 'dnd';

// Colour by intent rather than by exact key, so a vocabulary change on the
// platform doesn't leave a status rendering as "unknown".
function pillColor(value) {
  if (value === DND) return '#ef4444';
  if (String(value).startsWith('available')) return GREEN;
  if (value === 'logged_out') return '#6b7280';
  return '#f59e0b';
}

export default function PhonePresence({ userUuid, doNotDisturb, onDoNotDisturbChange }) {
  const { t } = useTranslation('phone');
  const [statuses, setStatuses] = useState({});
  const [presence, setPresence] = useState('available');
  const [error, setError] = useState(null);

  // Fetched when the picker is first opened, not on mount: this goes through
  // the shared client, and a boot-time enrichment fetch that can 401 is a trap
  // — it would bounce the session on every page load.
  const loadStatuses = useCallback(() => {
    if (Object.keys(statuses).length) return;
    statusesApi.getAgentStatuses()
      .then((res) => setStatuses(res && typeof res === 'object' ? res : {}))
      .catch(() => setStatuses({}));
  }, [statuses]);

  useEffect(() => { if (doNotDisturb === false && presence === DND) setPresence('available'); }, [doNotDisturb, presence]);

  const value = doNotDisturb ? DND : presence;

  const handleChange = (next) => {
    setError(null);
    if (next === DND) { onDoNotDisturbChange(true); return; }
    onDoNotDisturbChange(false);
    if (!userUuid) { setPresence(next); return; }
    // Optimistic: the pill moves at once and rolls back if the platform
    // refuses — publishing is the point, so a refusal has to be visible.
    const previous = presence;
    setPresence(next);
    statusesApi.setAgentStatus(userUuid, next).catch((err) => {
      setPresence(previous);
      setError(err?.message || t('presence.couldNotChange'));
    });
  };

  return (
    <Box>
      <Select
        data-testid="phone-presence-select"
        onOpen={loadStatuses}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        // Options load lazily, so until the picker is first opened there is
        // no MenuItem matching the value — label it from the value itself and
        // let the fetched list only improve the wording.
        renderValue={(v) => (v === DND ? t('presence.doNotDisturb') : (statuses[v] || String(v).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())))}
        variant="standard"
        disableUnderline
        sx={{
          mt: 0.5, fontSize: '0.72rem', fontWeight: 700, color: '#fff', borderRadius: 1, px: 1, py: 0.1,
          bgcolor: pillColor(value),
          '& .MuiSelect-select': { py: 0.2, pe: '20px !important' },
          '& .MuiSvgIcon-root': { color: '#fff' }
        }}
        MenuProps={{ MenuListProps: { dense: true } }}
      >
        {Object.entries(statuses).map(([key, label]) => (
          <MenuItem key={key} value={key} data-testid={`presence-${key}`}>{label}</MenuItem>
        ))}
        <MenuItem value={DND} data-testid="presence-dnd">{t('presence.doNotDisturb')}</MenuItem>
      </Select>
      {error && (
        <Typography data-testid="presence-error" sx={{ fontSize: '0.65rem', color: '#f87171', mt: 0.25 }}>
          {error}
        </Typography>
      )}
      {!error && <Box sx={{ color: MUTED }} />}
    </Box>
  );
}
