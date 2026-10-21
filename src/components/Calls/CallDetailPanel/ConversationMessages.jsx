import React, { useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress, Button } from '@mui/material';
import MessageIcon from '@mui/icons-material/Message';
import PhoneIcon from '@mui/icons-material/Phone';
import PhoneCallbackIcon from '@mui/icons-material/PhoneCallback';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import VoicemailIcon from '@mui/icons-material/Voicemail';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { dayKey, formatDayHeading, formatTime } from '../../../utils/dateUtils';
// Reuse existing Conversations bubble styling
import '../../Conversations/Conversations.css';

const formatMessageTime = (dateString) => formatTime(dateString);

const getDateSeparator = (dateString) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(dateString) === dayKey(new Date())) return i18n.t('calls:conversation.today');
  if (dayKey(dateString) === dayKey(yesterday)) return i18n.t('calls:conversation.yesterday');
  return formatDayHeading(dateString);
};

const getInteractionIcon = (type) => {
  switch (type) {
    case 'inbound': return <PhoneCallbackIcon sx={{ color: '#10b981' }} />;
    case 'outbound': return <PhoneIcon sx={{ color: '#3b82f6' }} />;
    case 'missed': return <PhoneMissedIcon sx={{ color: '#ef4444' }} />;
    case 'voicemail': return <VoicemailIcon sx={{ color: '#f59e0b' }} />;
    default: return <MessageIcon sx={{ color: 'var(--mui-palette-text-secondary)' }} />;
  }
};

const ConversationMessages = ({ messages, loading, error, emptyMessage, onRetry }) => {
  const { t } = useTranslation('calls');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 5 }}>
        <CircularProgress size={40} sx={{ color: '#65758E' }} />
        <Typography variant="body2" sx={{ fontFamily: 'Rubik, sans-serif', color: 'var(--mui-palette-text-secondary)' }}>
          {t('conversation.loading')}
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 5 }}>
        <Typography variant="body2" sx={{ fontFamily: 'Rubik, sans-serif', color: '#ef4444' }}>
          {error}
        </Typography>
        {onRetry && <Button onClick={onRetry}>{t('conversation.retry')}</Button>}
      </Box>
    );
  }

  if (!messages.length) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 5 }}>
        <MessageIcon sx={{ fontSize: 56, color: '#d1d5db' }} />
        <Typography variant="h6" sx={{ fontFamily: 'Rubik, sans-serif', color: 'var(--mui-palette-text-secondary)' }}>
          {emptyMessage || t('conversation.notFound')}
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: 'Rubik, sans-serif', color: '#d1d5db', textAlign: 'center' }}>
          {t('conversation.notLinked')}
        </Typography>
      </Box>
    );
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = getDateSeparator(message.timestamp || message.created_at);
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <Box className="chat-messages" sx={{ flex: 1, overflow: 'auto' }}>
      {Object.entries(groupedMessages).map(([date, msgs]) => (
        <Box key={date}>
          <Box className="date-separator">
            <Typography variant="caption" sx={{
              backgroundColor: 'rgba(101, 117, 142,0.1)',
              color: '#65758E',
              padding: '4px 12px',
              borderRadius: '12px',
              fontFamily: 'Rubik, sans-serif',
              fontSize: '0.75rem',
              fontWeight: 500,
            }}>
              {date}
            </Typography>
          </Box>

          {msgs.map((message) => (
            <Box
              key={message.id}
              className={`message ${message.direction === 'outbound' ? 'outbound' : 'inbound'} ${message.type === 'note' ? 'note-message' : ''}`}
            >
              {message.type === 'call' ? (
                <Box className="call-event">
                  {getInteractionIcon(message.callType)}
                  <Typography variant="body2" sx={{ fontFamily: 'Rubik, sans-serif' }}>
                    {message.callType === 'inbound' ? t('conversation.incomingCall') :
                     message.callType === 'outbound' ? t('conversation.outgoingCall') :
                     message.callType === 'missed' ? t('conversation.missedCall') : t('conversation.voicemail')}
                    {message.duration && ` - ${message.duration}`}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {formatMessageTime(message.timestamp || message.created_at)}
                  </Typography>
                </Box>
              ) : (
                <Box className={`message-bubble ${message.type === 'note' ? 'note-bubble' : ''}`}>
                  {message.type === 'note' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <StickyNote2Icon sx={{ fontSize: 12, color: '#f57f17' }} />
                      <Typography variant="caption" sx={{
                        color: '#f57f17',
                        fontFamily: 'Rubik, sans-serif',
                        fontWeight: 600,
                        fontSize: '0.65rem',
                      }}>
                        {t('conversation.privateNote')}
                      </Typography>
                    </Box>
                  )}
                  <Typography variant="body2" sx={{
                    fontFamily: 'Rubik, sans-serif',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}>
                    {message.body || message.content}
                  </Typography>
                  <Box className="message-time-wrapper">
                    <Typography variant="caption" className="message-time">
                      {formatMessageTime(message.timestamp || message.created_at)}
                    </Typography>
                    {message.direction === 'outbound' && message.type !== 'note' && (
                      <Box className="message-status">
                        {message.status === 'read' ? <DoneAllIcon sx={{ fontSize: 14, color: '#65758E' }} /> :
                         message.status === 'delivered' ? <DoneAllIcon sx={{ fontSize: 14, opacity: 0.6 }} /> :
                         <DoneIcon sx={{ fontSize: 14, opacity: 0.6 }} />}
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      ))}
      <div ref={messagesEndRef} />
    </Box>
  );
};

export default ConversationMessages;
