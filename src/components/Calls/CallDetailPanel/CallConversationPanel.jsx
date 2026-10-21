import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, Avatar } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import ConversationMessages from './ConversationMessages';
import MessageInput from '../../Conversations/MessageInput';
import conversationService from '../../../services/conversationService';
import { useAuth } from '../../../context/AuthContext';
import './CallDetailPanel.css';
import { useTranslation } from 'react-i18next';

const CallConversationPanel = ({ call, onBack, onClose, isMobile }) => {
  const { t } = useTranslation('calls');
  const { access } = useAuth();
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);

  const callUuid = call?.uuid;
  const caller = call?.profile?.caller || t('detail.unknown');
  const callee = call?.profile?.callee || '';

  useEffect(() => {
    if (!callUuid) return;

    const fetchConversation = async () => {
      setLoading(true);
      setError(null);
      setMessages([]);
      setConversation(null);

      try {
        const conv = await conversationService.getConversationByCallId(callUuid, access);
        if (!conv) {
          setLoading(false);
          return;
        }

        setConversation(conv);
        const convId = conv.id || conv.uuid;

        const msgData = await conversationService.getMessages(convId, access);
        const msgArray = Array.isArray(msgData) ? msgData
          : msgData?.data ? msgData.data
          : msgData?.messages ? msgData.messages
          : [];
        setMessages(msgArray);
      } catch (err) {
        console.error('Error loading conversation:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchConversation();
  }, [callUuid, access]);

  const contactName = conversation?.contactName || caller;
  const contactInitial = contactName?.charAt(0)?.toUpperCase() || '?';
  const convId = conversation?.id || conversation?.uuid;

  const handleSendMessage = async (conversationId, body) => {
    try {
      const newMsg = await conversationService.createMessage(conversationId, {
        body,
        direction: 'outbound',
        type: 'message',
      }, access);
      setMessages(prev => [...prev, newMsg]);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleSendNote = async (conversationId, body) => {
    try {
      const newMsg = await conversationService.createMessage(conversationId, {
        body,
        type: 'note',
      }, access);
      setMessages(prev => [...prev, newMsg]);
    } catch (err) {
      console.error('Error sending note:', err);
    }
  };

  return (
    <Box className={`call-detail-panel ${isMobile ? 'mobile' : ''}`}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderBottom: '1px solid var(--border-light)',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <IconButton onClick={onBack} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Avatar sx={{
          background: 'linear-gradient(135deg, #65758E, #4FA3A6)',
          color: 'white',
          fontWeight: 600,
          width: 36,
          height: 36,
          fontSize: '0.9rem',
        }}>
          {contactInitial}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{
            fontWeight: 600,
            fontFamily: 'Rubik, sans-serif',
          }}>
            {contactName}
          </Typography>
          {callee && (
            <Typography variant="caption" noWrap sx={{
              color: 'var(--theme-text-secondary)',
              fontFamily: 'Rubik, sans-serif',
            }}>
              {callee}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Messages */}
      <ConversationMessages
        messages={messages}
        loading={loading}
        error={error}
        emptyMessage={t('conversation.notFound')}
      />

      {/* Message Input - only show when conversation exists */}
      {conversation && (
        <MessageInput
          conversationId={convId}
          onSend={handleSendMessage}
          onSendNote={handleSendNote}
        />
      )}
    </Box>
  );
};

export default CallConversationPanel;
