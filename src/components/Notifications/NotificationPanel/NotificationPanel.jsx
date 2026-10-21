import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Paper,
  Avatar,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  Schedule as ScheduleIcon,
  BugReport as BugReportIcon,
  Code as CodeIcon,
  Delete as DeleteIcon,
  MarkEmailRead as MarkReadIcon,
  ContentCopy as CopyIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as SuccessIcon,
  MonitorHeart as MonitorIcon
} from '@mui/icons-material';
import { formatDate } from '../../../utils/dateUtils';
import './NotificationPanel.css';
import CopyableEmail from '../../common/CopyableEmail/CopyableEmail.jsx';
import { useConfirm } from '../../ui';
import { Trans, useTranslation } from 'react-i18next';
import Bdi from '../../../i18n/Bdi.jsx';

const NotificationPanel = ({ notification, onClose, onMarkAsRead, onDelete, fetchNotificationDetails }) => {
  const { t } = useTranslation('notifications');
  const confirm = useConfirm();
  const [copySuccess, setCopySuccess] = useState(false);
  const [fullDetails, setFullDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Fetch full details when notification changes (to get recipient info)
  useEffect(() => {
    if (notification?.uuid && fetchNotificationDetails) {
      setDetailsLoading(true);
      setFullDetails(null);
      fetchNotificationDetails(notification.uuid)
        .then(details => {
          setFullDetails(details);
        })
        .finally(() => {
          setDetailsLoading(false);
        });
    }
  }, [notification?.uuid, fetchNotificationDetails]);

  // Use fullDetails when available, otherwise fall back to notification
  const displayNotification = fullDetails || notification;
  const contextMeta = Object.entries(displayNotification?.meta || {})
    .filter(([key, value]) => key !== 'backtrace' && value !== null && value !== undefined && value !== '')
    .filter(([key]) => ['metric_type', 'reason', 'destination', 'call_uuid', 'environment_uuid', 'tariff_uuid'].includes(key));

  if (!notification) {
    return (
      <Box className="notification-panel" sx={{ p: 3 }}>
        <Typography variant="h6" color="textSecondary">
          Select a notification to view details
        </Typography>
      </Box>
    );
  }

  const getNotificationIcon = (type) => {
    const iconProps = { sx: { fontSize: 32 } };
    
    switch (type) {
      case 'exception':
        return <BugReportIcon {...iconProps} color="error" />;
      case 'error':
        return <ErrorIcon {...iconProps} color="error" />;
      case 'warning':
        return <WarningIcon {...iconProps} color="warning" />;
      case 'info':
        return <InfoIcon {...iconProps} color="info" />;
      case 'success':
        return <SuccessIcon {...iconProps} color="success" />;
      case 'health':
      case 'system_monitoring':
        return <MonitorIcon {...iconProps} color="error" />;
      default:
        return <InfoIcon {...iconProps} color="primary" />;
    }
  };

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleMarkAsRead = () => {
    onMarkAsRead(notification.uuid);
  };

  const handleDelete = async () => {
    if (await confirm({ title: t('panel.deleteTitle'), message: t('panel.deleteMessage') })) {
      onDelete(notification.uuid);
      onClose();
    }
  };

  const parseBacktrace = (backtraceString) => {
    try {
      const backtrace = JSON.parse(backtraceString);
      return Array.isArray(backtrace) ? backtrace : [backtraceString];
    } catch {
      return backtraceString.split('\n').filter(line => line.trim());
    }
  };

  return (
    <Box className="notification-panel" sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box className="panel-header" sx={{
        p: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'background.paper',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Avatar sx={{ backgroundColor: 'primary.lighter' }}>
            {getNotificationIcon(notification.type)}
          </Avatar>
          <Box>
            <Typography variant="h6" component="div">
              {t('panel.title')}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {formatDate(notification.created_at)}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label={t('panel.close')}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box className="panel-content" sx={{ 
        flexGrow: 1, 
        overflow: 'auto', 
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}>
        {/* Status and Actions */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" gap={1} flexWrap="wrap">
              <Chip
                label={notification.type}
                color="primary"
                variant="outlined"
                size="small"
              />
              <Chip
                label={notification.level}
                color={notification.level === 'critical' || notification.level === 'error' ? 'error' : notification.level === 'warning' ? 'warning' : 'default'}
                size="small"
              />
              <Chip
                label={notification.status || 'pending'}
                variant="outlined"
                size="small"
                sx={{
                  textTransform: 'capitalize',
                  borderColor: notification.status === 'resolved' ? 'success.main' : 'warning.main',
                  color: notification.status === 'resolved' ? 'success.main' : 'warning.main'
                }}
              />
              <Chip
                label={`×${notification.count || 1}`}
                color="secondary"
                size="small"
                title={t('panel.occurrences')}
              />
              {!notification.read_at && (
                <Chip
                  label={t('panel.unread')}
                  color="warning"
                  size="small"
                />
              )}
            </Box>
          </Box>

          <Box display="flex" gap={1}>
            {!notification.read_at && (
              <Button
                startIcon={<MarkReadIcon />}
                variant="outlined"
                size="small"
                onClick={handleMarkAsRead}
              >
                {t('panel.markAsRead')}
              </Button>
            )}
            <Button
              startIcon={<DeleteIcon />}
              variant="outlined"
              color="error"
              size="small"
              onClick={handleDelete}
            >
              {t('panel.delete')}
            </Button>
          </Box>
        </Paper>

        {/* Subject */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom color="primary">
            {t('panel.subject')}
          </Typography>
          <Typography variant="body1" sx={{ fontFamily: 'monospace', backgroundColor: 'grey.50', p: 1, borderRadius: 1 }}>
            {notification.subject}
          </Typography>
        </Paper>

        {/* Message */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="h6" color="primary">
              {t('panel.message')}
            </Typography>
            <IconButton 
              size="small" 
              onClick={() => handleCopyToClipboard(notification.msg)}
              aria-label={t('panel.copyMessage')}
            >
              <CopyIcon />
            </IconButton>
          </Box>
          <TextField
            multiline
            fullWidth
            value={notification.msg || t('panel.noMessage')}
            InputProps={{
              readOnly: true,
              sx: { fontFamily: 'monospace', fontSize: '0.9rem' }
            }}
            minRows={4}
            maxRows={10}
          />
        </Paper>

        {contextMeta.length > 0 && (
          <Paper elevation={1} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom color="primary">
              {t('panel.alertContext')}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 0.7fr) minmax(0, 1.3fr)', gap: 0.75, alignItems: 'center' }}>
              {contextMeta.map(([key, value]) => (
                <React.Fragment key={key}>
                  <Typography variant="caption" color="textSecondary" sx={{ textTransform: 'capitalize' }}>
                    {key.replaceAll('_', ' ')}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                    {String(value)}
                  </Typography>
                </React.Fragment>
              ))}
            </Box>
          </Paper>
        )}

        {/* Recipient Information */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom color="primary">
            {t('panel.recipient')}
          </Typography>
          {detailsLoading ? (
            <Box display="flex" alignItems="center" gap={2}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="textSecondary">
                {t('panel.loadingRecipient')}
              </Typography>
            </Box>
          ) : displayNotification.recipient ? (
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar>
                <PersonIcon />
              </Avatar>
              <Box>
                <Typography variant="subtitle1">
                  {displayNotification.recipient.fullname || `${displayNotification.recipient.first_name} ${displayNotification.recipient.last_name}`}
                </Typography>
                {displayNotification.recipient_type && (
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block', textTransform: 'capitalize' }}>
                    {t('panel.recipientType', { type: displayNotification.recipient_type })}
                  </Typography>
                )}
                <Typography variant="body2" color="textSecondary">
                  <CopyableEmail email={displayNotification.recipient.email} />
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  <Trans t={t} i18nKey="panel.recipientId" components={{ id: <Bdi>{displayNotification.recipient.uuid}</Bdi> }} />
                </Typography>
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="textSecondary">
              {t('panel.noRecipient')}
            </Typography>
          )}
          {!displayNotification.recipient && displayNotification.recipient_type && (
            <Typography variant="caption" color="textSecondary">
              {t('panel.recipientType', { type: displayNotification.recipient_type })}
            </Typography>
          )}
        </Paper>

        {/* Timeline */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom color="primary">
            {t('panel.timeline')}
          </Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            <Box display="flex" alignItems="center" gap={2}>
              <ScheduleIcon color="action" />
              <Box>
                <Typography variant="body2">{t('panel.created')}</Typography>
                <Typography variant="caption" color="textSecondary">
                  {formatDate(notification.created_at)}
                </Typography>
              </Box>
            </Box>
            {notification.updated_at && (
              <Box display="flex" alignItems="center" gap={2}>
                <ScheduleIcon color="action" />
                <Box>
                  <Typography variant="body2">{t('panel.lastUpdated')}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {formatDate(notification.updated_at)}
                  </Typography>
                </Box>
              </Box>
            )}
            {notification.read_at && (
              <Box display="flex" alignItems="center" gap={2}>
                <MarkReadIcon color="success" />
                <Box>
                  <Typography variant="body2">{t('panel.read')}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {formatDate(notification.read_at)}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Technical Details */}
        {notification.meta && notification.meta.backtrace && (
          <Paper elevation={1} sx={{ p: 2 }}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" gap={1}>
                  <CodeIcon color="primary" />
                  <Typography variant="h6" color="primary">
                    {t('panel.stackTrace')}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {parseBacktrace(notification.meta.backtrace).map((line, index) => (
                    <Typography
                      key={index}
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        color: 'text.secondary',
                        borderInlineStart: '2px solid',
                        borderColor: 'primary.main',
                        ps: 1,
                        mb: 0.5,
                        backgroundColor: index % 2 === 0 ? 'grey.50' : 'transparent'
                      }}
                    >
                      {line}
                    </Typography>
                  ))}
                </Box>
                <Box mt={2}>
                  <Button
                    startIcon={<CopyIcon />}
                    variant="outlined"
                    size="small"
                    onClick={() => handleCopyToClipboard(notification.meta.backtrace)}
                  >
                    {t('panel.copyStackTrace')}
                  </Button>
                </Box>
              </AccordionDetails>
            </Accordion>
          </Paper>
        )}
      </Box>

      {/* Copy Success Alert */}
      {copySuccess && (
        <Alert 
          severity="success" 
          sx={{ 
            position: 'fixed', 
            bottom: 16,
            insetInlineEnd: 16,
            zIndex: 1000 
          }}
        >
          {t('panel.copied')}
        </Alert>
      )}
    </Box>
  );
};

export default NotificationPanel;
