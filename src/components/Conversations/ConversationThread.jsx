import { Fragment, useId, useState } from 'react';
import ConversationActivity from './ConversationActivity.jsx';
import HistoryPeriod from './HistoryPeriod.jsx';
import NoteComposer from './NoteComposer.jsx';
import { useTranslation } from 'react-i18next';
import { Box, Button, CircularProgress, Divider, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { groupCallHistory, formatCallDuration } from './groupCallHistory';
import { inHistoryRange } from './historyActivity';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import CallSummary from './CallSummary.jsx';
import Bdi from '../../i18n/Bdi';
import { formatOnlyDate, formatTime } from '../../utils/dateUtils';

function Event({ ev, t }) {
  const time = ev.at ? formatTime(ev.at) : '';
  if (ev.kind === 'call' && (ev.data?.summary === 'true' || ev.data?.summary === true)) {
    return <Box data-testid="event-call"><CallSummary s={ev.data} t={t} time={time} /></Box>;
  }
  if (ev.kind === 'note') {
    return (
      <Box data-testid="event-note" sx={(theme) => ({ width: '100%', boxSizing: 'border-box', border: 1, borderColor: alpha(theme.palette.warning.main, 0.25), borderRadius: 2, p: 1.5, bgcolor: alpha(theme.palette.warning.main, 0.08) })}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, color: 'text.secondary' }}>
          <NotesOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{t('thread.note')}{ev.user_name || ev.agent_name ? ` · ${ev.user_name || ev.agent_name}` : ''}</Typography>
        </Box>
        <Typography sx={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ev.text}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'end', mt: 1, fontVariantNumeric: 'tabular-nums' }}>{time}</Typography>
      </Box>
    );
  }
  const action = ev.kind === 'call' ? (ev.data?.action || ev.text) : null;
  const label = action ? t(`events.${action}`, { defaultValue: ev.text || '' }) : ev.text;
  return (
    <Box data-testid={`event-${ev.kind}`} sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1, px: 1, color: 'text.secondary' }}>
      <Box aria-hidden sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'text.disabled', alignSelf: 'center', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere', minWidth: 0 }}>{label}</Typography>
      <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{time}</Typography>
    </Box>
  );
}

function CallGroup({ group, selected, t }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const direction = group.events.find((event) => event.data?.direction)?.data.direction;
  const summary = group.summary?.data || (group.callId === selected.call_uuid ? selected : { direction });
  const details = group.events.filter((event) => event !== group.summary);
  const hasDetails = details.length > 0 || summary.duration != null || summary.talk_duration != null;
  return (
    <CallSummary s={summary} t={t} time={group.at ? formatTime(group.at) : ''}>
      {hasDetails && <>
        <Button size="small" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}
          endIcon={<ExpandMoreIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />}
          sx={{ mt: 0.5, minHeight: 36, px: 0.5, textTransform: 'none', fontSize: 12 }}>
          {t(expanded ? 'thread.hideDetails' : 'thread.showDetails')}
        </Button>
        <Box id={detailsId} hidden={!expanded}>
          {expanded && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1, mt: 0.5, borderTop: 1, borderColor: 'divider' }}>
            {(summary.duration != null || summary.talk_duration != null) && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {summary.duration != null && <>{t('summary.totalTime')} <Bdi>{formatCallDuration(summary.duration)}</Bdi></>}
              {summary.duration != null && summary.talk_duration != null && ' · '}
              {summary.talk_duration != null && <>{t('summary.talk')} <Bdi>{formatCallDuration(summary.talk_duration)}</Bdi></>}
            </Typography>}
            {details.map((event) => <Event key={event.id} ev={event} t={t} />)}
          </Box>}
        </Box>
      </>}
    </CallSummary>
  );
}

/** Saved activity, call cards and notes share one readable conversation column. */
export default function ConversationThread({
  selected, events, loading, error, onRetry, canNotes, onNote, sendError,
  range = {}, onRangeChange,
}) {
  const { t } = useTranslation('conversations');
  if (!selected) {
    return <Box sx={{ p: 4, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, textAlign: 'center' }}>
      <ChatBubbleOutlineIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
      <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{t('thread.select')}</Typography>
      <Typography variant="body2" color="text.secondary">{t('thread.selectHint')}</Typography>
    </Box>;
  }
  const items = groupCallHistory(events);
  const visibleItems = items.filter((item) => inHistoryRange(item, range));
  const hasSelectedCall = items.some((item) => item.kind === 'call' && item.callId === selected.call_uuid);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1.5, md: 2.5 }, py: 2 }}>
        <Box sx={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {onRangeChange && <HistoryPeriod range={range} onChange={onRangeChange} />}
          {onRangeChange && !loading && !error && (
            <ConversationActivity items={items} selected={selected} range={range} onRangeChange={onRangeChange} />
          )}
          {!hasSelectedCall && inHistoryRange({ at: selected.started_at }, range) && <CallSummary s={selected} t={t} />}
          {loading && <CircularProgress size={22} sx={{ alignSelf: 'center' }} />}
          {!loading && !error && visibleItems.length === 0 && <Typography variant="body2" color="text.secondary">{t('thread.empty')}</Typography>}
          {error && <Box role="alert"><Typography color="error">{t('thread.error')}</Typography><Button onClick={onRetry}>{t('thread.retry')}</Button></Box>}
          {!loading && !error && visibleItems.map((item, index) => {
            const day = item.at ? formatOnlyDate(item.at) : '';
            const previous = index > 0 && visibleItems[index - 1].at ? formatOnlyDate(visibleItems[index - 1].at) : '';
            return <Fragment key={`${selected.call_uuid}-${item.id}`}>
              {day && day !== previous && <Divider sx={{ my: 0.5, '&::before, &::after': { borderColor: 'divider' } }}><Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>{day}</Typography></Divider>}
              {item.kind === 'call' ? <CallGroup group={item} selected={selected} t={t} /> : <Event ev={item.event} t={t} />}
            </Fragment>;
          })}
        </Box>
      </Box>
      {canNotes && <NoteComposer key={selected.call_uuid} onNote={onNote} sendError={sendError} />}
    </Box>
  );
}
