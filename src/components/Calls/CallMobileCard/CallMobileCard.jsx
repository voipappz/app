import React from 'react';
import { useTranslation } from 'react-i18next';
import Bdi from '../../../i18n/Bdi';
import {
  Card, CardContent, CardHeader, Avatar, Chip, Typography, Box, Tooltip, IconButton
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import moment from 'moment';
import ReactCountryFlag from 'react-country-flag';
import { formatPhoneNumber, extractCountryFromPhone, formatDuration } from '../../../utils/phoneUtils';

const CallMobileCard = ({ call, onOpenRecording, onRowClick }) => {
  const { t } = useTranslation('calls');
  const caller = call.profile?.caller || t('mobile.notAvailable');
  const callee = call.profile?.callee;
  const formattedCallee = callee ? formatPhoneNumber(callee) : t('mobile.notAvailable');
  const direction = call.profile?.direction;
  const duration = call.profile?.talk_duration;
  const formattedDuration = duration ? formatDuration(parseInt(duration)) : '00:00:00';
  const cause = call.profile?.cause;
  const environment = call.environment?.name || t('mobile.notAvailable');
  const cid = call.profile?.cid || t('mobile.notAvailable');
  // Support both new and legacy recording URL paths
  const recordingUrl = call.recording?.url || call.profile?.recordingUrl;
  
  const createdAt = call.created_at;
  const callTime = moment(createdAt);
  const now = moment();
  
  let displayTime;
  if (callTime.isSame(now, 'day')) {
    displayTime = callTime.format('HH:mm:ss');
  } else if (callTime.isSame(now, 'week')) {
    displayTime = callTime.format('ddd HH:mm');
  } else {
    displayTime = callTime.format('DD/MM HH:mm');
  }

  const getDirectionIcon = () => {
    if (direction === 'inbound') {
      return <CallReceivedIcon sx={{ color: 'white', fontSize: 18 }} />;
    } else if (direction === 'outbound') {
      return <CallMadeIcon sx={{ color: 'white', fontSize: 18 }} />;
    }
    return <PhoneIcon sx={{ color: 'white', fontSize: 18 }} />;
  };

  const getDirectionColor = () => {
    if (direction === 'inbound') {
      return '#4CAF50'; // Green for inbound
    } else if (direction === 'outbound') {
      return '#FF9800'; // Orange for outbound
    }
    return '#9E9E9E'; // Grey for unknown
  };

  const getCauseIcon = () => {
    if (cause === 'NORMAL_CLEARING' || cause === 'answered') {
      return <CheckCircleIcon sx={{ fontSize: 16 }} />;
    }
    return <CancelIcon sx={{ fontSize: 16 }} />;
  };

  const getCauseColor = () => {
    if (cause === 'NORMAL_CLEARING' || cause === 'answered') {
      return 'success';
    }
    return 'error';
  };

  const getCountryFlag = () => {
    if (!callee) return null;
    const countryInfo = extractCountryFromPhone(callee);
    if (!countryInfo.code) return null;
    
    return (
      <Tooltip title={countryInfo.name}>
        <ReactCountryFlag 
          countryCode={countryInfo.code} 
          svg 
          style={{ width: '1.2em', height: '1em', marginLeft: '4px' }}
        />
      </Tooltip>
    );
  };

  const getInitials = (name) => {
    if (!name || name === 'N/A') return '?';
    return name.split(' ').map(word => word.charAt(0).toUpperCase()).join('').substring(0, 2);
  };

  return (
    <Card className="agent-card" sx={{ mb: 1, cursor: 'pointer' }} onClick={() => onRowClick?.(call)}>
      <CardHeader
        avatar={
          <Avatar sx={{ bgcolor: getDirectionColor(), color: 'white' }}>
            {getInitials(caller)}
          </Avatar>
        }
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title={caller} placement="top">
              <Typography variant="h6" noWrap sx={{ maxWidth: '120px' }}>
                <Bdi>{caller}</Bdi>
              </Typography>
            </Tooltip>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {displayTime}
            </Typography>
          </Box>
        }
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              icon={getDirectionIcon()}
              label={direction || t('mobile.unknown')}
              size="small"
              sx={{ 
                backgroundColor: getDirectionColor(), 
                color: 'white', 
                fontWeight: 'medium',
                textTransform: 'capitalize'
              }}
            />
            {recordingUrl && (
              <IconButton
                size="small"
                onClick={() => onOpenRecording?.(
                  recordingUrl,
                  call.uuid,
                  caller,
                  callee,
                  createdAt
                )}
                sx={{ color: 'primary.main' }}
              >
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        }
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ pt: 1 }}>
        <Box className="agent-card-details">
          <Box className="detail-item">
            <PhoneIcon fontSize="small" className="detail-icon" />
            <Typography variant="body2" className="detail-label">{t('mobile.client')}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="body2" className="detail-value"><Bdi>{formattedCallee}</Bdi></Typography>
              {getCountryFlag()}
            </Box>
          </Box>

          <Box className="detail-item">
            <AccessTimeIcon fontSize="small" className="detail-icon" />
            <Typography variant="body2" className="detail-label">{t('mobile.duration')}</Typography>
            <Typography variant="body2" className="detail-value">{formattedDuration}</Typography>
          </Box>

          <Box className="detail-item">
            {getCauseIcon()}
            <Typography variant="body2" className="detail-label">{t('mobile.status')}</Typography>
            <Chip
              label={cause || t('mobile.unknown')}
              size="small"
              color={getCauseColor()}
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: '20px' }}
            />
          </Box>

          <Box className="detail-item">
            <PersonIcon fontSize="small" className="detail-icon" />
            <Typography variant="body2" className="detail-label">{t('mobile.application')}</Typography>
            <Typography variant="body2" className="detail-value" noWrap>
              {environment}
            </Typography>
          </Box>

          <Box className="detail-item">
            <Typography variant="body2" className="detail-label" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              {t('mobile.callId')} <Bdi>{cid}</Bdi>
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CallMobileCard;