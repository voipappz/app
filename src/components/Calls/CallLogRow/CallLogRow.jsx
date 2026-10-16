import { useState } from 'react';
import { Box, Button, ButtonBase, Collapse, IconButton, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { ChevronRight as DetailsIcon, ContentCopy as CopyIcon, Phone as PhoneIcon } from '@mui/icons-material';
import Bdi from '../../../i18n/Bdi';
import AudioPreview from '../../common/AudioPreview/AudioPreview';
import { isolated } from '../../Phone/isolated';
import { formatTime } from '../../../utils/dateUtils';
import { useDialNow } from '../../../hooks/useDialNow';
import CallDirectionIcon from './CallDirectionIcon';
import { callFacts, recordingUrl, shortDuration } from './callDirection';

/**
 * One call in the phone's call history, on one line: direction, the other
 * party's number, how long it took and when. A tap opens the line in place
 * with what you do next: call back, play the recording, copy, or details.
 */
export default function CallLogRow({ call, expanded, onToggle, onOpenDetails }) {
  const { t } = useTranslation('calls');
  const theme = useTheme();
  const { canDial, dialNow } = useDialNow();
  const [copied, setCopied] = useState(false);
  const facts = callFacts(call);
  const time = formatTime(call.created_at);
  const number = facts.number || t('mobile.unknown');
  const recording = recordingUrl(call);
  const label = facts.kind === 'unknown'
    ? `${t('mobile.kind.unknown')} ${isolated(number)}, ${time}`
    : t(`mobile.row.${facts.kind}`, { number: isolated(number), time });

  const copy = () => {
    navigator.clipboard?.writeText(facts.number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <Box component="li" data-testid="call-log-row" sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider' }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={label}
        sx={{ width: '100%', minHeight: 56, px: 1, gap: 1.5, justifyContent: 'flex-start', textAlign: 'start' }}
      >
        <CallDirectionIcon kind={facts.kind} />
        <Typography
          noWrap
          component="span"
          sx={{ flex: 1, minWidth: 0, fontWeight: 500, color: facts.missed ? 'error.main' : 'text.primary' }}
        >
          <Bdi>{number}</Bdi>
        </Typography>
        <Typography component="span" variant="body2" color="text.secondary" dir="ltr">
          {facts.missed ? '–' : shortDuration(facts.seconds)}
        </Typography>
        <Typography component="span" variant="body2" color="text.secondary" sx={{ minWidth: 44, textAlign: 'end' }}>
          {time}
        </Typography>
      </ButtonBase>

      <Collapse in={expanded} unmountOnExit>
        <Box data-testid="call-log-actions" sx={{ px: 1, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {recording && <AudioPreview src={recording} playLabel={t('mobile.actions.play')} />}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {canDial && facts.number && (
              <Button variant="contained" color="success" size="small" startIcon={<PhoneIcon />} onClick={() => dialNow(facts.number)}>
                {t('mobile.actions.call')}
              </Button>
            )}
            {facts.number && (
              <Tooltip title={copied ? t('mobile.actions.copied') : t('mobile.actions.copy')}>
                <IconButton aria-label={t('mobile.actions.copy')} onClick={copy}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Button
              size="small"
              onClick={() => onOpenDetails(call)}
              endIcon={<DetailsIcon sx={{ transform: theme.direction === 'rtl' ? 'scaleX(-1)' : undefined }} />}
              sx={{ ms: 'auto' }}
            >
              {t('mobile.actions.details')}
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
