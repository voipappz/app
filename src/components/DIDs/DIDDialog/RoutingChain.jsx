import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Box, Paper, Typography, Chip, Skeleton, IconButton, Tooltip, Button } from '@mui/material';
import {
  Phone as PhoneIcon,
  Headset as HeadsetIcon,
  AccessTime as ClockIcon,
  AccountTree as IvrIcon,
  Campaign as AnnouncementIcon,
  Code as VmlIcon,
  SmartToy as BotIcon,
  SettingsPhone as ExtensionIcon,
  Edit as EditIcon,
  FiberManualRecord as DotIcon,
} from '@mui/icons-material';
import { queuesApi } from '../../../services/api/queuesApi';
import { getCallCondition } from '../../../services/api/callConditionsApi';
import { ivrApi } from '../../../services/api/ivrApi';
import { bridgeApi } from '../../../services/api/bridgeApi';
import AudioPreview from '../../common/AudioPreview/AudioPreview.jsx';
import { useTranslation } from 'react-i18next';
import { conditionToForm } from '../../Bridges/CallConditionBridge/callConditionSchedule';
import { WeekSummary } from '../../Bridges/CallConditionBridge/WeekHoursEditor';
import { describeRule } from '../../Bridges/CallConditionBridge/MoreRules';

const TYPE_CONFIG = {
  queue: { icon: HeadsetIcon, color: '#2e7d32' },
  call_condition: { icon: ClockIcon, color: '#ed6c02' },
  ivr: { icon: IvrIcon, color: '#7b1fa2' },
  announcement: { icon: AnnouncementIcon, color: '#0288d1' },
  vml: { icon: VmlIcon, color: '#616161' },
  bot: { icon: BotIcon, color: '#d32f2f' },
  extension: { icon: ExtensionIcon, color: '#00796b' },
  number: { icon: PhoneIcon, color: '#455a64' },
};

// A bridge type's icon and colour, with its name in the current language. A
// type the chain does not know shows its own value.
const typeInfo = (t, type, fallbackLabel = type) => (TYPE_CONFIG[type]
  ? { ...TYPE_CONFIG[type], label: t(`chain.type.${type}`) }
  : { icon: PhoneIcon, color: 'var(--mui-palette-text-secondary)', label: fallbackLabel });

const formatStrategy = (s) => s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

// VML's own `data` is script text, not a response envelope. Keep the
// resource (especially its UUID) when opening it from the route preview.
const unwrapResource = (response) => response?.data?.uuid ? response.data : response;

const getAgentStatusColor = (status) => {
  if (!status) return '#9e9e9e';
  const s = status.toLowerCase();
  if (s === 'available') return '#4caf50';
  if (s === 'on break') return '#ff9800';
  if (s === 'logged out') return '#9e9e9e';
  if (s.includes('on demand')) return '#2196f3';
  return '#9e9e9e';
};

const getAgentStateColor = (state) => {
  if (!state) return '#9e9e9e';
  const s = state.toLowerCase();
  if (s === 'idle' || s === 'waiting' || s === 'ready') return '#4caf50';
  if (s === 'receiving') return '#ff9800';
  if (s.includes('queue call')) return '#f44336';
  return '#9e9e9e';
};

const getStatusDotColor = (tier) => {
  if (tier.agent_status) return getAgentStatusColor(tier.agent_status);
  return getAgentStateColor(tier.agent_state || tier.state);
};

/* ── Shared sub-components ── */

const CardHeader = ({ type, onEdit }) => {
  const { t } = useTranslation('routes');
  const config = typeInfo(t, type);
  const Icon = config.icon;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
      <Icon sx={{ fontSize: 20, color: config.color }} />
      <Typography variant="overline" sx={{ color: config.color, fontWeight: 700, letterSpacing: 1, lineHeight: 1.4 }}>
        {config.label}
      </Typography>
      <Box sx={{ flex: 1 }} />
      {onEdit && (
        <Button
          size="small"
          startIcon={<EditIcon sx={{ fontSize: 14 }} />}
          onClick={onEdit}
          sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0, py: 0 }}
        >
          {t('chain.edit')}
        </Button>
      )}
    </Box>
  );
};

const StatChips = ({ items }) => (
  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
    {items.filter(Boolean).map((item, i) => (
      <Chip key={i} label={item} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 24 }} />
    ))}
  </Box>
);

const SectionDivider = ({ label }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1.5 }}>
    <Box sx={{ flex: 1, borderBottom: '1px dashed', borderColor: 'divider' }} />
    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </Typography>
    <Box sx={{ flex: 1, borderBottom: '1px dashed', borderColor: 'divider' }} />
  </Box>
);

const DownstreamBadge = ({ label, type, name, onEdit }) => {
  const { t } = useTranslation('routes');
  const config = typeInfo(t, type);
  const Icon = config.icon;
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.5, py: 0.75,
      bgcolor: 'action.hover', borderRadius: 1,
      borderInlineStart: `3px solid ${config.color}`,
    }}>
      <Icon sx={{ fontSize: 16, color: config.color }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={500} noWrap sx={{ fontSize: '0.8rem' }}>
          {t('chain.typeAndName', { type: config.label, name })}
        </Typography>
      </Box>
      {onEdit && (
        <Tooltip title={t('chain.editType', { type: config.label })}>
          <IconButton size="small" onClick={onEdit} sx={{ p: 0.25 }}>
            <EditIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

/* ── Bridge-specific cards ── */

const QueueCard = ({ data, timeoutDest, onEditBridge }) => {
  const { t } = useTranslation('routes');
  const [expanded, setExpanded] = useState(false);
  const tiers = data.tiers || [];
  const VISIBLE = 5;
  const visibleTiers = expanded ? tiers : tiers.slice(0, VISIBLE);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderInlineStart: `4px solid ${TYPE_CONFIG.queue.color}` }}>
      <CardHeader type="queue" onEdit={onEditBridge ? () => onEditBridge('queue', data) : null} />
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>{data.name}</Typography>
      <StatChips items={[
        formatStrategy(data.strategy),
        data.max_wait_time ? t('chain.waitSeconds', { n: data.max_wait_time }) : null,
        t(tiers.length === 1 ? 'chain.agentsOne' : 'chain.agentsOther', { n: tiers.length }),
        data.enabled !== false ? t('chain.enabled') : t('chain.disabled'),
      ]} />

      {tiers.length > 0 && (
        <>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('chain.agents')}
          </Typography>
          {visibleTiers.map((tier) => {
            const dotColor = getStatusDotColor(tier);
            return (
              <Box key={tier.agent} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4, px: 0.5 }}>
                <DotIcon sx={{ fontSize: 10, color: dotColor }} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {tier.agent_name || tier.agent?.slice(0, 8)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {t('chain.level', { n: tier.level || '1' })}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {t('chain.position', { n: tier.position || '1' })}
                </Typography>
                {(tier.agent_status || tier.agent_state || tier.state) && (
                  <Chip
                    label={tier.agent_status || tier.agent_state || tier.state}
                    size="small"
                    sx={{
                      fontSize: '0.6rem', height: 18,
                      bgcolor: `${dotColor}20`,
                      color: dotColor,
                      border: `1px solid ${dotColor}40`,
                    }}
                  />
                )}
              </Box>
            );
          })}
          {tiers.length > VISIBLE && (
            <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ textTransform: 'none', fontSize: '0.7rem', mt: 0.5 }}>
              {expanded ? t('chain.showLess') : t('chain.showAllAgents', { n: tiers.length })}
            </Button>
          )}
        </>
      )}

      {timeoutDest && (
        <>
          <SectionDivider label={t('chain.timeoutWait', { n: data.max_wait_time || 0 })} />
          <DownstreamBadge
            label={t('chain.timeoutDestination')}
            type={timeoutDest.type}
            name={timeoutDest.name}
            onEdit={onEditBridge ? () => onEditBridge(timeoutDest.type, timeoutDest.data) : null}
          />
        </>
      )}
    </Paper>
  );
};

// One "→ Queue: Support ✎" line under a call condition rule.
const ConditionDestination = ({ target, names, onEditBridge }) => {
  const { t } = useTranslation('routes');
  if (!target?.type) return null;
  const config = typeInfo(t, target.type);
  const name = names?.[target.uuid] || target.uuid?.slice(0, 8) || '';
  const Icon = config.icon;
  const editLabel = t('chain.editTypeNamed', { type: config.label, name });
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{t('chain.arrow')}</Typography>
      <Icon sx={{ fontSize: 14, color: config.color, flexShrink: 0 }} />
      <Typography variant="body2" fontWeight={500} sx={{ flex: 1, minWidth: 0 }} noWrap>{t('chain.typeAndName', { type: config.label, name })}</Typography>
      {onEditBridge && target.uuid && (
        <Tooltip title={editLabel}>
          <IconButton size="small" aria-label={editLabel} onClick={() => onEditBridge(target.type, { uuid: target.uuid })} sx={{ p: 0.25 }}>
            <EditIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

// A call condition read the way its page shows it: business hours in short,
// the rules checked before them as sentences, then where calls go otherwise.
// The ✎ beside a destination edits that destination (a device, a queue...);
// the header's Edit opens the condition itself.
const CallConditionCard = ({ data, ruleDestinations, fallbackDest, onEditBridge }) => {
  const { t } = useTranslation('callConditions');
  const form = conditionToForm(data);
  const anyOpen = form.week.some((day) => day.open);
  return (
    <Paper variant="outlined" sx={{ p: 2, borderInlineStart: `4px solid ${TYPE_CONFIG.call_condition.color}` }}>
      <CardHeader type="call_condition" onEdit={onEditBridge ? () => onEditBridge('call_condition', data) : null} />
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>{data.name}</Typography>

      {form.rules.length > 0 && (
        <Box sx={{ mb: 1.5 }} data-testid="condition-rules">
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block' }}>
            {t('rules.title')}
          </Typography>
          {form.rules.map((rule) => (
            <Box key={rule.id} sx={{ py: 0.4 }}>
              <Typography variant="body2">{describeRule(t, rule)}</Typography>
              <ConditionDestination target={rule.target} names={ruleDestinations} onEditBridge={onEditBridge} />
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ mb: 1.5 }} data-testid="condition-hours">
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block' }}>
          {t('hours.title')}
        </Typography>
        <WeekSummary week={form.week} />
        {anyOpen && <ConditionDestination target={form.openTarget} names={ruleDestinations} onEditBridge={onEditBridge} />}
      </Box>

      {fallbackDest && (
        <>
          <SectionDivider label={t('targets.otherwise')} />
          <DownstreamBadge
            label={t('targets.otherwiseHint')}
            type={fallbackDest.type}
            name={fallbackDest.name}
            onEdit={onEditBridge ? () => onEditBridge(fallbackDest.type, fallbackDest.data) : null}
          />
        </>
      )}
    </Paper>
  );
};

const IVRCard = ({ data, entryDestinations, timeoutDest, invalidDest, onEditBridge }) => {
  const { t } = useTranslation('routes');
  const [expanded, setExpanded] = useState(false);
  const entries = data.entries || data.options || {};
  const entryList = Array.isArray(entries)
    ? entries
    : Object.entries(entries).map(([key, val]) => ({ key, ...val }));
  const VISIBLE = 6;
  const visibleEntries = expanded ? entryList : entryList.slice(0, VISIBLE);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderInlineStart: `4px solid ${TYPE_CONFIG.ivr.color}` }}>
      <CardHeader type="ivr" onEdit={onEditBridge ? () => onEditBridge('ivr', data) : null} />
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>{data.name}</Typography>
      {/* The greeting callers hear before choosing. */}
      {data.announcement_uuid && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block' }}>{t('chain.greeting')}</Typography>
          <AudioPreview key={data.announcement_uuid} uuid={data.announcement_uuid} />
        </Box>
      )}
      <StatChips items={[
        t(entryList.length === 1 ? 'chain.optionsOne' : 'chain.optionsOther', { n: entryList.length }),
        data.timeout ? t('chain.timeoutSeconds', { n: data.timeout }) : null,
        data.enabled !== false ? t('chain.enabled') : t('chain.disabled'),
      ]} />

      {entryList.length > 0 && (
        <>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('chain.menuOptions')}
          </Typography>
          {visibleEntries.map((entry, i) => {
            const bt = entry.bridge_type === 'que' ? 'queue' : entry.bridge_type;
            const config = typeInfo(t, bt, bt || t('chain.unknown'));
            const destName = entryDestinations?.[entry.bridge_uuid] || entry.bridge?.name || bt || '';
            const Icon = config.icon;
            const digit = entry.key || entry.digit || entry.name || i;
            return (
              <Box key={entry.uuid || `${digit}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4, px: 0.5 }}>
                <Chip label={digit} size="small" sx={{ fontSize: '0.7rem', height: 20, minWidth: 28, fontWeight: 700 }} />
                {entry.name && entry.name !== digit && (
                  <Typography variant="body2" sx={{ minWidth: 50, maxWidth: 100 }} noWrap>
                    {entry.name}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">{t('chain.arrow')}</Typography>
                <Icon sx={{ fontSize: 14, color: config.color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {t('chain.typeAndName', { type: config.label, name: destName })}
                </Typography>
                {onEditBridge && bt && entry.bridge_uuid && (
                  <Tooltip title={t('chain.editType', { type: config.label })}>
                    <IconButton size="small" onClick={() => onEditBridge(bt, entry.bridge || { uuid: entry.bridge_uuid })} sx={{ p: 0.25 }}>
                      <EditIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            );
          })}
          {entryList.length > VISIBLE && (
            <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ textTransform: 'none', fontSize: '0.7rem', mt: 0.5 }}>
              {expanded ? t('chain.showLess') : t('chain.more', { n: entryList.length - VISIBLE })}
            </Button>
          )}
        </>
      )}

      {(timeoutDest || invalidDest) && (
        <>
          <SectionDivider label={t('chain.fallback')} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {timeoutDest && (
              <DownstreamBadge label={t('chain.timeout')} type={timeoutDest.type} name={timeoutDest.name}
                onEdit={onEditBridge ? () => onEditBridge(timeoutDest.type, timeoutDest.data) : null} />
            )}
            {invalidDest && (
              <DownstreamBadge label={t('chain.invalidInput')} type={invalidDest.type} name={invalidDest.name}
                onEdit={onEditBridge ? () => onEditBridge(invalidDest.type, invalidDest.data) : null} />
            )}
          </Box>
        </>
      )}
    </Paper>
  );
};

const SimpleCard = ({ type, data, onEditBridge }) => (
  <Paper variant="outlined" sx={{ p: 2, borderInlineStart: `4px solid ${(TYPE_CONFIG[type] || {}).color || '#757575'}` }}>
    <CardHeader type={type} onEdit={onEditBridge ? () => onEditBridge(type, data) : null} />
    <Typography variant="body2" fontWeight={600}>{data?.name || type}</Typography>
    {type === 'announcement' && data?.uuid && (
      <Box sx={{ mt: 1 }}>
        <AudioPreview src={data.path || data.url} uuid={data.uuid} />
      </Box>
    )}
  </Paper>
);

/* ── Fresh after an edit ── */

// A chain shows what its destination held when it loaded, and editing a
// destination keeps its uuid, so nothing in the chain's props changes. The
// route wizard keeps the route form (and the details page stays) open behind
// the editor, so the chain must be told: every save of a destination counts
// here, and every chain on screen loads again.
let savedDestinations = 0;
const chainListeners = new Set();

/** Call when a destination (queue, IVR, call condition...) has been saved. */
export const refreshRoutingChains = () => {
  savedDestinations += 1;
  chainListeners.forEach((listener) => listener());
};

const useSavedDestinations = () => useSyncExternalStore(
  (listener) => { chainListeners.add(listener); return () => chainListeners.delete(listener); },
  () => savedDestinations,
);

/* ── Main orchestrator ── */

const RoutingChain = ({ bridgeType, bridgeUuid, environmentUuid, onEditBridge }) => {
  const { t } = useTranslation('routes');
  const saved = useSavedDestinations();
  const [bridgeInfo, setBridgeInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const buildChain = useCallback(async () => {
    if (!bridgeType || !bridgeUuid || !environmentUuid) {
      setBridgeInfo(null);
      return;
    }

    const bt = bridgeType === 'que' ? 'queue' : bridgeType;
    setLoading(true);

    try {
      if (bt === 'queue') {
        const resp = await queuesApi.getQueue(bridgeUuid);
        const q = unwrapResource(resp);
        if (!q) { setBridgeInfo(null); return; }

        let timeoutDest = null;
        const tbt = q.max_wait_time_bridge_type === 'que' ? 'queue' : q.max_wait_time_bridge_type;
        if (tbt && q.max_wait_time_bridge_uuid) {
          try {
            const dest = await bridgeApi.getBridgeResource(tbt, q.max_wait_time_bridge_uuid);
            const d = unwrapResource(dest);
            timeoutDest = { type: tbt, name: d?.name || t('chain.unknown'), data: d || { uuid: q.max_wait_time_bridge_uuid } };
          } catch {
            timeoutDest = { type: tbt, name: q.max_wait_time_bridge_uuid.slice(0, 8), data: { uuid: q.max_wait_time_bridge_uuid } };
          }
        }

        setBridgeInfo({ type: 'queue', data: q, timeoutDest });

      } else if (bt === 'call_condition') {
        const resp = await getCallCondition(bridgeUuid);
        const cc = unwrapResource(resp);
        if (!cc) { setBridgeInfo(null); return; }

        const resources = cc.resources || [];
        const ruleDestinations = {};
        const destPromises = [];

        // Resolve unique bridge_uuids for rule destinations
        const seen = new Set();
        for (const r of resources) {
          if (r.bridge_uuid && r.bridge_type && !seen.has(r.bridge_uuid)) {
            seen.add(r.bridge_uuid);
            const rbt = r.bridge_type === 'que' ? 'queue' : r.bridge_type;
            destPromises.push(
              bridgeApi.getBridgeResource(rbt, r.bridge_uuid)
                .then(d => { ruleDestinations[r.bridge_uuid] = unwrapResource(d)?.name || rbt; })
                .catch(() => { ruleDestinations[r.bridge_uuid] = r.bridge_uuid.slice(0, 8); })
            );
          }
        }

        let fallbackDest = null;
        const fbt = cc.fallback_bridge_type === 'que' ? 'queue' : cc.fallback_bridge_type;
        if (fbt && cc.fallback_bridge_uuid) {
          destPromises.push(
            bridgeApi.getBridgeResource(fbt, cc.fallback_bridge_uuid)
              .then(d => {
                const fd = unwrapResource(d);
                fallbackDest = { type: fbt, name: fd?.name || t('chain.unknown'), data: fd || { uuid: cc.fallback_bridge_uuid } };
              })
              .catch(() => {
                fallbackDest = { type: fbt, name: cc.fallback_bridge_uuid.slice(0, 8), data: { uuid: cc.fallback_bridge_uuid } };
              })
          );
        }

        await Promise.all(destPromises);
        setBridgeInfo({ type: 'call_condition', data: cc, ruleDestinations, fallbackDest });

      } else if (bt === 'ivr') {
        const resp = await ivrApi.getIVR(bridgeUuid);
        const ivr = unwrapResource(resp);
        if (!ivr) { setBridgeInfo(null); return; }

        const entries = ivr.entries || ivr.options || {};
        const entryList = Array.isArray(entries) ? entries : Object.values(entries);
        const entryDestinations = {};
        const destPromises = [];

        const seen = new Set();
        for (const e of entryList) {
          if (e.bridge_uuid && e.bridge_type && !seen.has(e.bridge_uuid)) {
            seen.add(e.bridge_uuid);
            const ebt = e.bridge_type === 'que' ? 'queue' : e.bridge_type;
            destPromises.push(
              bridgeApi.getBridgeResource(ebt, e.bridge_uuid)
                .then(d => { entryDestinations[e.bridge_uuid] = unwrapResource(d)?.name || ebt; })
                .catch(() => { entryDestinations[e.bridge_uuid] = e.bridge_uuid.slice(0, 8); })
            );
          }
        }

        let timeoutDest = null;
        let invalidDest = null;

        if (ivr.timeout_bridge_type && ivr.timeout_bridge_uuid) {
          const tbt = ivr.timeout_bridge_type === 'que' ? 'queue' : ivr.timeout_bridge_type;
          destPromises.push(
            bridgeApi.getBridgeResource(tbt, ivr.timeout_bridge_uuid)
              .then(d => {
                const td = unwrapResource(d);
                timeoutDest = { type: tbt, name: td?.name || t('chain.unknown'), data: td || { uuid: ivr.timeout_bridge_uuid } };
              })
              .catch(() => {
                timeoutDest = { type: tbt, name: ivr.timeout_bridge_uuid.slice(0, 8), data: { uuid: ivr.timeout_bridge_uuid } };
              })
          );
        }

        if (ivr.invalid_bridge_type && ivr.invalid_bridge_uuid) {
          const ibt = ivr.invalid_bridge_type === 'que' ? 'queue' : ivr.invalid_bridge_type;
          destPromises.push(
            bridgeApi.getBridgeResource(ibt, ivr.invalid_bridge_uuid)
              .then(d => {
                const id2 = unwrapResource(d);
                invalidDest = { type: ibt, name: id2?.name || t('chain.unknown'), data: id2 || { uuid: ivr.invalid_bridge_uuid } };
              })
              .catch(() => {
                invalidDest = { type: ibt, name: ivr.invalid_bridge_uuid.slice(0, 8), data: { uuid: ivr.invalid_bridge_uuid } };
              })
          );
        }

        await Promise.all(destPromises);
        setBridgeInfo({ type: 'ivr', data: ivr, entryDestinations, timeoutDest, invalidDest });

      } else {
        // Simple types: announcement, vml, bot, extension, number
        try {
          const resp = await bridgeApi.getBridgeResource(bt, bridgeUuid);
          const d = unwrapResource(resp);
          setBridgeInfo({ type: bt, data: d || { uuid: bridgeUuid, name: bt } });
        } catch {
          setBridgeInfo({ type: bt, data: { uuid: bridgeUuid, name: bt } });
        }
      }
    } catch (err) {
      console.error('RoutingChain: Error building chain:', err);
      setBridgeInfo(null);
    } finally {
      setLoading(false);
    }
  // `saved` is not read here: it is a dependency so the chain loads again
  // after a destination is saved.
  }, [bridgeType, bridgeUuid, environmentUuid, t, saved]);

  useEffect(() => { buildChain(); }, [buildChain]);

  if (loading) {
    return (
      <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
    );
  }

  if (!bridgeInfo) return null;

  return (
    <Box sx={{ mt: 0, mb: 0 }}>
      {bridgeInfo.type === 'queue' && (
        <QueueCard key={bridgeInfo.data?.uuid} data={bridgeInfo.data} timeoutDest={bridgeInfo.timeoutDest} onEditBridge={onEditBridge} />
      )}
      {bridgeInfo.type === 'call_condition' && (
        <CallConditionCard key={bridgeInfo.data?.uuid} data={bridgeInfo.data} ruleDestinations={bridgeInfo.ruleDestinations}
          fallbackDest={bridgeInfo.fallbackDest} onEditBridge={onEditBridge} />
      )}
      {bridgeInfo.type === 'ivr' && (
        <IVRCard key={bridgeInfo.data?.uuid} data={bridgeInfo.data} entryDestinations={bridgeInfo.entryDestinations}
          timeoutDest={bridgeInfo.timeoutDest} invalidDest={bridgeInfo.invalidDest} onEditBridge={onEditBridge} />
      )}
      {!['queue', 'call_condition', 'ivr'].includes(bridgeInfo.type) && (
        <SimpleCard key={bridgeInfo.data?.uuid} type={bridgeInfo.type} data={bridgeInfo.data} onEditBridge={onEditBridge} />
      )}
    </Box>
  );
};

export default RoutingChain;
