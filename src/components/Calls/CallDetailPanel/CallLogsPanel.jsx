import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useTranslation } from 'react-i18next';
import CallHistory from '../CallHistory/CallHistory';
import Bdi from '../../../i18n/Bdi';
import './CallDetailPanel.css';

// "Call logs": the other calls with this call's number. A click opens that call.
const CallLogsPanel = ({ call, onBack, onClose, onOpenCall, isMobile }) => {
  const { t } = useTranslation('calls');
  const caller = call?.profile?.caller || t('detail.unknown');

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
        <IconButton onClick={onBack} size="small" aria-label={t('detail.back')}>
          <ArrowBackIcon sx={{ '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} />
        </IconButton>
        <ReceiptLongIcon sx={{ color: 'var(--accent-primary)' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600, fontFamily: 'Rubik, sans-serif' }}>
            {t('detail.callLogsTitle')}
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: 'var(--theme-text-secondary)', fontFamily: 'Rubik, sans-serif' }}>
            <Bdi>{caller}</Bdi>
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label={t('detail.close')}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        <CallHistory callUuid={call?.uuid || call?.id} onOpenCall={onOpenCall} />
      </Box>
    </Box>
  );
};

export default CallLogsPanel;
