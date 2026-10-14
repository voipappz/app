import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { isolated } from '../../Phone/isolated';
import { formatDayHeading, formatTime } from '../../../utils/dateUtils';
import CallDirectionIcon from '../CallLogRow/CallDirectionIcon';
import { callFacts, shortDuration } from '../CallLogRow/callDirection';
import { useCallHistory } from './useCallHistory';

/**
 * The other calls with this call's number, one line each; a click opens that
 * call. Used by the phone's call details page and the desktop "Call logs".
 */
export default function CallHistory({ callUuid, onOpenCall }) {
  const { t } = useTranslation('calls');
  const { status, calls } = useCallHistory(callUuid);

  if (status === 'loading') return <CircularProgress size={20} />;
  if (status === 'error') return <Typography variant="body2" color="error">{t('mobile.details.historyError')}</Typography>;
  if (calls.length === 0) return <Typography variant="body2" color="text.secondary">{t('mobile.details.noHistory')}</Typography>;
  return (
    <Box component="ul" sx={{ p: 0, m: 0 }}>
      {calls.map((other) => <HistoryLine key={other.uuid} call={other} onOpen={onOpenCall} />)}
    </Box>
  );
}

// An earlier call with the same number: direction, day and time, duration.
function HistoryLine({ call, onOpen }) {
  const { t } = useTranslation('calls');
  const facts = callFacts(call);
  const when = `${formatDayHeading(call.created_at)} ${formatTime(call.created_at)}`;
  const label = facts.kind === 'unknown'
    ? `${t('mobile.kind.unknown')} ${isolated(facts.number)}, ${when}`
    : t(`mobile.row.${facts.kind}`, { number: isolated(facts.number), time: when });
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        onClick={() => onOpen(call)}
        aria-label={label}
        sx={{ width: '100%', minHeight: 44, gap: 1.5, justifyContent: 'flex-start', textAlign: 'start', borderRadius: 1 }}
      >
        <CallDirectionIcon kind={facts.kind} />
        <Typography component="span" variant="body2" sx={{ flex: 1, color: facts.missed ? 'error.main' : 'text.primary' }}>{when}</Typography>
        <Typography component="span" variant="body2" color="text.secondary" dir="ltr">
          {facts.missed ? '–' : shortDuration(facts.seconds)}
        </Typography>
      </ButtonBase>
    </Box>
  );
}
