import React, { useState, useEffect } from 'react';
import {
  Box, Typography, IconButton, Avatar, Button, Divider, Paper
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import PhoneIcon from '@mui/icons-material/Phone';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import SwapCallsIcon from '@mui/icons-material/SwapCalls';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import BusinessIcon from '@mui/icons-material/Business';
import DnsIcon from '@mui/icons-material/Dns';
import CallEndIcon from '@mui/icons-material/CallEnd';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import EventNoteIcon from '@mui/icons-material/EventNote';
import SubjectIcon from '@mui/icons-material/Subject';
import DetailRow from './DetailRow';
import ConversationMessages from './ConversationMessages';
import CallTimeline from './CallTimeline';
import { usePermissions } from '../../../hooks/usePermissions';
import conversationService from '../../../services/conversationService';
import { useAuth } from '../../../context/AuthContext';
import { apiService } from '../../../services/apiService';
import { formatDuration } from '../../../utils/phoneUtils';
import { formatPhoneNumber } from '../../../utils/phoneUtils';
import moment from 'moment';
import './CallDetailPanel.css';

const CallDetailPanel = ({ call, onClose, onOpenRecording, onViewLogs, onViewEvents, onCallBack, isMobile }) => {
  // The portal reuses this panel with a user session, where AuthContext holds
  // no admin token; apiService.getToken() returns whichever session exists.
  const { access: adminAccess } = useAuth();
  const access = adminAccess || apiService.getToken();
  const [transcript, setTranscript] = useState([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState(null);
  const [transcriptAttempt, setTranscriptAttempt] = useState(0);

  const callUuid = call?.uuid;
  // The events timeline reads /api/events, an account surface; the portal
  // (a user session) reuses this panel without it.
  // The call's events show to whichever session's ACL grants `logs`.
  const { canAccess } = usePermissions();
  const canSeeEvents = canAccess('logs');

  // Load the call's transcription inline (the transcribe service writes the
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
        if (!cancelled) setTranscriptError('The transcript is temporarily unavailable. Please try again.');
      } finally {
        if (!cancelled) setTranscriptLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [callUuid, access, transcriptAttempt]);

  if (!call) return null;

  const caller = call.profile?.caller || 'Unknown';
  const callee = call.profile?.callee || 'Unknown';
  const direction = call.profile?.direction;
  const duration = call.profile?.talk_duration;
  const cause = call.profile?.cause;
  const cid = call.profile?.cid;
  const contact = call.profile?.contact;
  const provider = call.profile?.provider;
  const hangupDisposition = call.profile?.hangup_disposition;
  const environment = call.environment?.name;
  const uuid = call.uuid;
  const createdAt = call.created_at;
  const recordingUrl = call.recording?.url || call.profile?.recordingUrl;

  const formattedDate = createdAt ? moment(createdAt).format('MMM DD, YYYY HH:mm:ss') : 'N/A';
  const formattedDuration = duration ? formatDuration(parseInt(duration)) : '00:00:00';

  const getDirectionColor = () => {
    if (direction === 'inbound') return 'var(--color-success)';
    if (direction === 'outbound') return 'var(--color-warning)';
    return 'var(--color-neutral)';
  };

  const getDirectionIcon = () => {
    if (direction === 'inbound') return <CallReceivedIcon sx={{ fontSize: 20 }} />;
    if (direction === 'outbound') return <CallMadeIcon sx={{ fontSize: 20 }} />;
    return <PhoneIcon sx={{ fontSize: 20 }} />;
  };

  const getCauseChipProps = () => {
    if (cause === 'NORMAL_CLEARING' || cause === 'answered' || cause === 'answer') {
      return { color: 'success' };
    }
    return { color: 'error' };
  };

  const getInitials = (name) => {
    if (!name || name === 'Unknown') return '?';
    return name.split(' ').map(w => w.charAt(0).toUpperCase()).join('').substring(0, 2);
  };

  return (
    <Box className={`call-detail-panel ${isMobile ? 'mobile' : ''}`}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 2,
        borderBottom: '1px solid var(--border-light)',
        backgroundColor: 'var(--bg-secondary)'
      }}>
        <IconButton onClick={onClose} size="small">
          {isMobile ? <ArrowBackIcon /> : <CloseIcon />}
        </IconButton>
        <Typography variant="subtitle1" sx={{
          fontWeight: 600,
          fontFamily: 'Rubik, sans-serif',
          flex: 1
        }}>
          Call Details
        </Typography>
      </Box>

      {/* Caller/Callee card */}
      <Paper elevation={0} sx={{
        m: 2,
        p: 2,
        borderRadius: '12px',
        background: 'var(--gradient-purple-light)',
        border: '1px solid var(--gradient-purple-border)'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{
            bgcolor: getDirectionColor(),
            width: 48,
            height: 48,
            fontSize: '1.1rem',
            fontWeight: 600
          }}>
            {getInitials(caller)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap sx={{
              fontWeight: 600,
              fontFamily: 'Rubik, sans-serif',
              color: 'var(--text-primary)'
            }}>
              {caller}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'var(--text-secondary)' }}>
              {getDirectionIcon()}
              <Typography variant="body2" noWrap sx={{ fontFamily: 'Rubik, sans-serif' }}>
                {formatPhoneNumber(callee)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Metadata (pinned) */}
      <Box sx={{ px: 2 }}>
        <DetailRow
          icon={<CalendarTodayIcon />}
          label="Date"
          value={formattedDate}
        />
        <DetailRow
          icon={<AccessTimeIcon />}
          label="Duration"
          value={formattedDuration}
        />
        <DetailRow
          icon={<SwapCallsIcon />}
          label="Direction"
          value={direction || 'Unknown'}
          chip={{ color: direction === 'inbound' ? 'success' : direction === 'outbound' ? 'warning' : 'default' }}
        />
        <DetailRow
          icon={<CheckCircleIcon />}
          label="Status"
          value={cause || 'Unknown'}
          chip={getCauseChipProps()}
        />
        <DetailRow
          icon={<PersonIcon />}
          label="Contact"
          value={contact}
        />
        <DetailRow
          icon={<PhoneIcon />}
          label="CID"
          value={cid}
          copyable
        />
        <DetailRow
          icon={<BusinessIcon />}
          label="Provider"
          value={provider}
        />
        <DetailRow
          icon={<CallEndIcon />}
          label="Hangup"
          value={hangupDisposition}
        />
        <DetailRow
          icon={<DnsIcon />}
          label="Application"
          value={environment}
        />
        <DetailRow
          icon={<FingerprintIcon />}
          label="UUID"
          value={uuid}
          copyable
        />
      </Box>

      {/* What happened around the call (record, recording, services…) */}
      {canSeeEvents && <>
      <Divider sx={{ mt: 1 }} />
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <EventNoteIcon sx={{ fontSize: 18, color: 'var(--text-secondary)' }} />
        <Typography variant="subtitle2" sx={{
          fontWeight: 600,
          fontFamily: 'Rubik, sans-serif',
          color: 'var(--text-primary)'
        }}>
          Events
        </Typography>
      </Box>
      <CallTimeline callUuid={callUuid} onOpenEvents={onViewEvents} />
      </>}

      {/* Transcription (inline) */}
      <Divider sx={{ mt: 1 }} />
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <SubjectIcon sx={{ fontSize: 18, color: 'var(--text-secondary)' }} />
        <Typography variant="subtitle2" sx={{
          fontWeight: 600,
          fontFamily: 'Rubik, sans-serif',
          color: 'var(--text-primary)'
        }}>
          Transcription
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ConversationMessages
          messages={transcript}
          loading={transcriptLoading}
          error={transcriptError}
          onRetry={() => setTranscriptAttempt((attempt) => attempt + 1)}
          emptyMessage="No transcription for this call"
        />
      </Box>

      {/* Actions */}
      <Divider />
      <Box sx={{ p: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {recordingUrl && (
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={() => onOpenRecording?.(
              recordingUrl,
              call.uuid,
              caller,
              callee,
              createdAt
            )}
            sx={{
              backgroundColor: 'var(--accent-primary)',
              textTransform: 'none',
              fontFamily: 'Rubik, sans-serif',
              fontWeight: 500,
              borderRadius: '8px',
              flex: 1,
              '&:hover': { backgroundColor: 'var(--accent-primary-hover)' }
            }}
          >
            Play Recording
          </Button>
        )}
        {onCallBack && (
          <Button
            variant="contained"
            color="success"
            startIcon={<PhoneIcon />}
            onClick={onCallBack}
            data-testid="call-detail-call-back"
            sx={{ textTransform: 'none', fontFamily: 'Rubik, sans-serif', fontWeight: 500, borderRadius: '8px', flex: 1 }}
          >
            Call back
          </Button>
        )}
        {onViewLogs && (
          <Button
            variant="outlined"
            startIcon={<ReceiptLongIcon />}
            onClick={onViewLogs}
            sx={{
              textTransform: 'none',
              fontFamily: 'Rubik, sans-serif',
              fontWeight: 500,
              borderRadius: '8px',
              borderColor: 'var(--accent-primary)',
              color: 'var(--theme-text-primary)',
              flex: 1,
              '&:hover': { borderColor: 'var(--accent-primary-hover)', color: 'var(--accent-primary-hover)', backgroundColor: 'var(--accent-primary-alpha-8)' }
            }}
          >
            Call logs
          </Button>
        )}
        {onViewEvents && (
          <Button
            variant="outlined"
            startIcon={<EventNoteIcon />}
            onClick={onViewEvents}
            sx={{
              textTransform: 'none',
              fontFamily: 'Rubik, sans-serif',
              fontWeight: 500,
              borderRadius: '8px',
              borderColor: 'var(--accent-primary)',
              color: 'var(--theme-text-primary)',
              flex: 1,
              '&:hover': { borderColor: 'var(--accent-primary-hover)', color: 'var(--accent-primary-hover)', backgroundColor: 'var(--accent-primary-alpha-8)' }
            }}
          >
            Events
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default CallDetailPanel;
