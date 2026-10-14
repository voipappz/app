import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { ArrowBack as BackIcon, Download as DownloadIcon, Phone as PhoneIcon, Timeline as EventsIcon } from '@mui/icons-material';
import { ResponsiveDialog } from '../../ui';
import Bdi from '../../../i18n/Bdi';
import { formatDate } from '../../../utils/dateUtils';
import { useDialNow } from '../../../hooks/useDialNow';
import CallDirectionIcon from '../CallLogRow/CallDirectionIcon';
import { callFacts, recordingUrl, shortDuration } from '../CallLogRow/callDirection';
import { callSummary } from './callSummary';
import { useCallDetails } from './useCallDetails';
import CallHistory from '../CallHistory/CallHistory';

// The call's own facts, in the order a person asks them. Numbers and names
// come from the server as they are; empty ones are left out.
const INFO = [
  { key: 'from', field: 'caller', number: true },
  { key: 'to', field: 'callee', number: true },
  { key: 'route', field: 'did_name' },
  { key: 'queue', field: 'queue_name' },
  { key: 'agent', field: 'user_name' },
  { key: 'device', field: 'extension_name' },
  { key: 'contact', field: 'contact_name' },
  { key: 'country', field: 'country' },
  { key: 'provider', field: 'provider_name' },
  { key: 'hangup', field: 'hangup_disposition' },
];

function Section({ title, children, testId }) {
  return (
    <Box component="section" data-testid={testId} sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="overline" component="h3" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function InfoLine({ label, children }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 0.5 }}>
      <Typography component="dt" variant="body2" color="text.secondary" sx={{ width: 96, flexShrink: 0 }}>{label}</Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Typography>
    </Box>
  );
}

/**
 * Everything about one call, full screen on a phone: who and when, call back,
 * the recording, the summary and transcription from the server, the details,
 * and the other calls with the same number (a tap opens that one).
 */
export default function CallDetailsScreen({ call, open, onClose, onOpenCall, canViewEvents, onViewEvents }) {
  const { t } = useTranslation('calls');
  const theme = useTheme();
  const { canDial, dialNow } = useDialNow();
  const { transcript } = useCallDetails(open ? call : null);
  if (!call) return null;

  const facts = callFacts(call);
  const profile = call.profile || {};
  const recording = recordingUrl(call);
  const summary = callSummary(call);
  const number = facts.number || t('mobile.unknown');

  return (
    <ResponsiveDialog open={open} onClose={onClose} fullScreenBelow="md" fullWidth maxWidth="sm" aria-labelledby="call-details-title">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <IconButton onClick={onClose} aria-label={t('mobile.details.close')}>
          <BackIcon sx={{ transform: theme.direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
        </IconButton>
        <Typography id="call-details-title" variant="h6" component="h2">{t('mobile.details.title')}</Typography>
      </Box>

      <Box sx={{ overflowY: 'auto' }}>
        <Box sx={{ px: 2, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CallDirectionIcon kind={facts.kind} fontSize="medium" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" component="p" noWrap sx={{ color: facts.missed ? 'error.main' : 'text.primary' }}>
              <Bdi>{number}</Bdi>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(`mobile.kind.${facts.kind}`)} · {formatDate(call.created_at)}
              {!facts.missed && <> · <bdi dir="ltr">{shortDuration(facts.seconds)}</bdi></>}
            </Typography>
          </Box>
          {canDial && facts.number && (
            <Button variant="contained" color="success" startIcon={<PhoneIcon />} onClick={() => dialNow(facts.number)}>
              {t('mobile.actions.call')}
            </Button>
          )}
        </Box>

        {recording && (
          <Section title={t('mobile.details.recording')} testId="call-details-recording">
            <Box component="audio" controls preload="none" src={recording} sx={{ width: '100%' }} />
            <Button size="small" href={recording} download target="_blank" rel="noopener noreferrer" startIcon={<DownloadIcon />}>
              {t('mobile.details.download')}
            </Button>
          </Section>
        )}

        {summary && (
          <Section title={t('mobile.details.summary')} testId="call-details-summary">
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{summary}</Typography>
          </Section>
        )}

        <Section title={t('mobile.details.transcript')} testId="call-details-transcript">
          {transcript.status === 'loading' && <CircularProgress size={20} />}
          {transcript.status === 'error' && <Typography variant="body2" color="error">{t('mobile.details.transcriptError')}</Typography>}
          {transcript.status === 'done' && (transcript.text
            ? <Typography variant="body2" dir="auto" sx={{ whiteSpace: 'pre-wrap' }}>{transcript.text}</Typography>
            : <Typography variant="body2" color="text.secondary">{t('mobile.details.noTranscript')}</Typography>)}
        </Section>

        <Section title={t('mobile.details.info')} testId="call-details-info">
          <Box component="dl" sx={{ m: 0 }}>
            <InfoLine label={t('mobile.details.status')}>
              {facts.missed ? t('mobile.details.notAnswered') : t('mobile.details.answered')}
            </InfoLine>
            {INFO.filter(({ field }) => profile[field]).map(({ key, field, number: isNumber }) => (
              <InfoLine key={key} label={t(`mobile.details.${key}`)}>
                {isNumber ? <Bdi>{profile[field]}</Bdi> : profile[field]}
              </InfoLine>
            ))}
          </Box>
          {canViewEvents && (
            <Button size="small" startIcon={<EventsIcon />} onClick={() => onViewEvents(call)} sx={{ mt: 1 }}>
              {t('mobile.details.events')}
            </Button>
          )}
        </Section>

        <Section title={t('mobile.details.history')} testId="call-details-history">
          <CallHistory callUuid={call.uuid} onOpenCall={onOpenCall} />
        </Section>
      </Box>
    </ResponsiveDialog>
  );
}

