import { RecordingControls } from '../CallIcons';
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, IconButton, Button, Chip, Tab, Tabs, Tooltip, Collapse, ButtonBase,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import PhoneIcon from '@mui/icons-material/Phone';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useTheme } from '@mui/material/styles';
import ConversationMessages from './ConversationMessages';
import CallTimeline from './CallTimeline';
import CallProfile, { profileRows } from './CallProfile';
import CallHistory from '../CallHistory/CallHistory';
import { useNumberBlock } from '../CallActions/CallActions';
import CallDirectionIcon from '../CallLogRow/CallDirectionIcon';
import { callFacts, recordingUrl, shortDuration } from '../CallLogRow/callDirection';
import { usePermissions } from '../../../hooks/usePermissions';
import { useSessionRole } from '../../../hooks/useIsUserSession';
import { useDialNow } from '../../../hooks/useDialNow';
import conversationService from '../../../services/conversationService';
import { useAuth } from '../../../context/AuthContext';
import { apiService } from '../../../services/apiService';
import { formatPhoneNumber } from '../../../utils/phoneUtils';
import { useTranslation } from 'react-i18next';
import Bdi from '../../../i18n/Bdi';
import { formatDate } from '../../../utils/dateUtils';
import { callStatusWord } from '../callWords';
import './CallDetailPanel.css';

// The facts people ask about a call, in the order they ask them; empty ones
// are left out. Labels are shared with the phone's call details page.
const SUMMARY_FACTS = [
  { label: 'mobile.details.route', value: (p) => p.did_name },
  { label: 'mobile.details.queue', value: (p) => p.queue_name },
  { label: 'mobile.details.agent', value: (p) => p.user_name },
  { label: 'mobile.details.device', value: (p) => p.extension_name },
  { label: 'mobile.details.contact', value: (p) => p.contact_name || p.contact },
  { label: 'detail.endedBy', value: (p) => p.hangup_disposition && callStatusWord(p.hangup_disposition) },
  { label: 'detail.application', value: (p, call) => call.environment?.name || p.environment_name },
  { label: 'mobile.details.provider', value: (p) => p.provider_name || p.provider },
];

// Shown in the summary block or the Summary tab: kept out of Technical details.
const SHOWN_IN_SUMMARY = new Set([
  'direction', 'cause', 'talk_duration', 'caller', 'callee', 'did_name', 'queue_name',
  'user_name', 'extension_name', 'contact_name', 'contact', 'hangup_disposition',
  'environment_name', 'provider_name', 'provider',
]);

const CAUSE_COLORS = { answer: 'success', no_answer: 'error', busy: 'error', failed: 'error', cancel: 'error' };

/**
 * One call, beside the Calls list (and in the phone drawer): the story first —
 * direction, result, who to whom, when and how long, the recording and Call
 * back — then one tab at a time: Summary, Transcription, History, Events.
 *
 * Technical details (ids, SIP, codecs, quality, addresses, raw fields) are an
 * account's: a portal user never sees them.
 */
const CallDetailPanel = ({ call, onClose, onViewEvents, onCallBack, onOpenCall, onBlockChanged, isMobile }) => {
  const { t } = useTranslation('calls');
  // The portal reuses this panel with a user session, where AuthContext holds
  // no admin token; apiService.getToken() returns whichever session exists.
  const { access: adminAccess } = useAuth();
  const access = adminAccess || apiService.getToken();
  const isAdmin = useSessionRole() === 'admin';
  // A closed section's arrow points along the reading direction.
  const ClosedIcon = useTheme().direction === 'rtl' ? ChevronLeftIcon : ChevronRightIcon;
  const { canDial, dialNow } = useDialNow();
  const [transcript, setTranscript] = useState([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState(null);
  const [transcriptAttempt, setTranscriptAttempt] = useState(0);
  const [chosenTab, setChosenTab] = useState('summary');
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const callUuid = call?.uuid;
  const { blocked, toggle: toggleBlock } = useNumberBlock({ call, onChanged: onBlockChanged });
  // The call's events show to whichever session's ACL grants `logs`; "Open in
  // Events" inside the tab appears only where the screen can open them.
  const { canAccess } = usePermissions();
  const canSeeEvents = canAccess('logs');

  // Another call opens on Summary, technical details closed.
  useEffect(() => {
    setChosenTab('summary');
    setTechnicalOpen(false);
  }, [callUuid]);

  // Load the call's transcription (the transcribe service writes the
  // conversation messages linked to the call). Internal notes are filtered out.
  useEffect(() => {
    if (!callUuid) return;
    let cancelled = false;

    const load = async () => {
      setTranscriptLoading(true);
      setTranscriptError(null);
      setTranscript([]);
      try {
        const conv = await conversationService.getConversationByCallId(callUuid, access);
        if (!conv) { if (!cancelled) setTranscriptLoading(false); return; }
        const msgData = await conversationService.getMessages(conv.id || conv.uuid, access);
        const msgArray = Array.isArray(msgData) ? msgData
          : msgData?.data ? msgData.data
          : msgData?.messages ? msgData.messages
          : [];
        if (!cancelled) setTranscript(msgArray.filter(m => m.type !== 'note'));
      } catch {
        if (!cancelled) setTranscriptError(t('detail.transcriptError'));
      } finally {
        if (!cancelled) setTranscriptLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [callUuid, access, transcriptAttempt]);

  if (!call) return null;

  const profile = call.profile || {};
  const facts = callFacts(call);
  const recording = recordingUrl(call);
  const caller = profile.caller ? formatPhoneNumber(profile.caller) : t('detail.unknown');
  const callee = profile.callee ? formatPhoneNumber(profile.callee) : t('detail.unknown');
  const cause = profile.cause;
  const resultWord = cause === 'answer' ? t('mobile.details.answered')
    : cause === 'no_answer' ? t('mobile.details.notAnswered')
    : cause ? callStatusWord(cause) : null;

  const callBack = onCallBack || (canDial && facts.number ? () => dialNow(facts.number) : null);
  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(facts.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };

  const summaryFacts = SUMMARY_FACTS
    .map((fact) => ({ label: t(fact.label), value: fact.value(profile, call) }))
    .filter((fact) => fact.value);
  const technicalProfile = { uuid: call.uuid, ...profile };
  const technicalCount = isAdmin ? profileRows(technicalProfile, SHOWN_IN_SUMMARY).length : 0;

  const tabs = [
    { value: 'summary', label: t('detail.tabs.summary') },
    { value: 'transcription', label: t('detail.tabs.transcription') },
    ...(onOpenCall ? [{ value: 'history', label: t('detail.tabs.history') }] : []),
    ...(canSeeEvents ? [{ value: 'events', label: t('detail.tabs.events') }] : []),
  ];
  // Always opens on Summary, never switching by itself (the transcription
  // loads after the panel opens, and a jump would move the text being read).
  const tab = tabs.some((item) => item.value === chosenTab) ? chosenTab : 'summary';

  return (
    <Box className={`call-detail-panel ${isMobile ? 'mobile' : ''}`}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1.25,
        borderBottom: '1px solid var(--border-light)',
      }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, fontFamily: 'Rubik, sans-serif', flex: 1 }}>
          {t('detail.title')}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label={t('detail.close')}>
          {isMobile ? <ArrowBackIcon sx={{ '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} /> : <CloseIcon />}
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', '& > *': { flexShrink: 0 } }}>
        {/* The call in one look: direction and result, who to whom, when and how long. */}
        <Box data-testid="call-summary" sx={{ px: 2, pt: 2, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <CallDirectionIcon kind={facts.kind} />
            {profile.direction && (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{callStatusWord(profile.direction)}</Typography>
            )}
            {resultWord && (
              <Chip label={resultWord} size="small" color={CAUSE_COLORS[cause] || 'default'} variant="outlined" sx={{ height: 22 }} />
            )}
            {blocked && (
              <Chip label={t('block.blockedChip')} size="small" color="error" icon={<BlockIcon />} sx={{ height: 22 }} />
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography variant="h6" component="p" noWrap sx={{ fontSize: '1.05rem', fontWeight: 600, minWidth: 0 }}>
              <Bdi>{caller}</Bdi>
            </Typography>
            <ArrowForwardIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0, '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} />
            <Typography variant="h6" component="p" noWrap sx={{ fontSize: '1.05rem', fontWeight: 600, minWidth: 0 }}>
              <Bdi>{callee}</Bdi>
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary">
            {call.created_at ? formatDate(call.created_at) : t('mobile.notAvailable')}
            {!facts.missed && facts.seconds > 0 && (
              <> · {t('detail.talked', { duration: shortDuration(facts.seconds) })}</>
            )}
          </Typography>

          {recording && <RecordingControls key={recording} recordingUrl={recording} />}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {callBack && (
              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={<PhoneIcon />}
                onClick={callBack}
                data-testid="call-detail-call-back"
                sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 500 }}
              >
                {t('detail.callBack')}
              </Button>
            )}
            {facts.number && (
              <Tooltip title={copied ? t('mobile.actions.copied') : t('mobile.actions.copy')}>
                <IconButton size="small" onClick={copyNumber} aria-label={t('mobile.actions.copy')}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {facts.number && (
              <Button
                size="small"
                variant={blocked ? 'text' : 'outlined'}
                color={blocked ? 'inherit' : 'error'}
                startIcon={blocked ? <LockOpenIcon /> : <BlockIcon />}
                onClick={toggleBlock}
                data-testid="call-detail-block"
                sx={{ ms: 'auto', textTransform: 'none', borderRadius: '8px' }}
              >
                {blocked ? t('block.unblockNumber') : t('block.blockNumber')}
              </Button>
            )}
          </Box>
        </Box>

        <Tabs
          value={tab}
          onChange={(_, value) => setChosenTab(value)}
          variant="fullWidth"
          sx={{ minHeight: 40, borderBottom: '1px solid var(--border-light)', '& .MuiTab-root': { minHeight: 40, textTransform: 'none', px: 1 } }}
        >
          {tabs.map((item) => <Tab key={item.value} value={item.value} label={item.label} />)}
        </Tabs>

        {tab === 'summary' && (
          <Box data-testid="call-detail-summary-tab" sx={{ py: 1 }}>
            {summaryFacts.length > 0 ? (
              <Box component="dl" sx={{ m: 0, px: 2, display: 'grid', gridTemplateColumns: 'minmax(90px, 35%) minmax(0, 1fr)', columnGap: 2 }}>
                {summaryFacts.map((fact) => (
                  <React.Fragment key={fact.label}>
                    <Typography component="dt" variant="body2" color="text.secondary" sx={{ py: 0.75 }}>{fact.label}</Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, py: 0.75, fontWeight: 500, overflowWrap: 'anywhere' }}>{fact.value}</Typography>
                  </React.Fragment>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>{t('detail.noDetails')}</Typography>
            )}

            {technicalCount > 0 && (
              <Box sx={{ mt: 1, borderTop: '1px solid var(--border-light)' }}>
                <ButtonBase
                  onClick={() => setTechnicalOpen((open) => !open)}
                  aria-expanded={technicalOpen}
                  data-testid="call-detail-technical"
                  sx={{ width: '100%', justifyContent: 'flex-start', gap: 0.5, px: 2, py: 1.25, color: 'text.secondary' }}
                >
                  {technicalOpen ? <ExpandMoreIcon fontSize="small" /> : <ClosedIcon fontSize="small" />}
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {t('detail.technical', { n: technicalCount })}
                  </Typography>
                </ButtonBase>
                <Collapse in={technicalOpen} unmountOnExit>
                  <CallProfile profile={technicalProfile} shownElsewhere={SHOWN_IN_SUMMARY} heading={false} />
                </Collapse>
              </Box>
            )}
          </Box>
        )}

        {tab === 'transcription' && (
          <Box sx={{ flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column' }}>
            <ConversationMessages
              messages={transcript}
              loading={transcriptLoading}
              error={transcriptError}
              onRetry={() => setTranscriptAttempt((attempt) => attempt + 1)}
              emptyMessage={t('detail.noTranscription')}
            />
          </Box>
        )}

        {tab === 'history' && (
          <Box sx={{ px: 1.5, py: 1 }}>
            <CallHistory callUuid={callUuid} onOpenCall={onOpenCall} />
          </Box>
        )}

        {tab === 'events' && (
          <Box sx={{ pt: 1 }}>
            <CallTimeline callUuid={callUuid} onOpenEvents={onViewEvents} />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default CallDetailPanel;
