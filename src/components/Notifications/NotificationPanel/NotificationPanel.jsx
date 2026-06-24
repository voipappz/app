import React, { useState } from 'react';
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
  Alert
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
  CheckCircle as SuccessIcon
} from '@mui/icons-material';
import './NotificationPanel.css';

const NotificationPanel = ({ notification, onClose, onMarkAsRead, onDelete }) => {
  // const [showBacktrace, setShowBacktrace] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

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
      default:
        return <InfoIcon {...iconProps} color="primary" />;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
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

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this notification?')) {
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
              Notification Details
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {formatDate(notification.created_at)}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
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
            <Box display="flex" gap={1}>
              <Chip 
                label={notification.type} 
                color="primary" 
                variant="outlined"
                size="small"
              />
              <Chip 
                label={notification.level} 
                color={notification.level === 'error' ? 'error' : 'default'}
                size="small"
              />
              {notification.count > 1 && (
                <Chip 
                  label={`×${notification.count}`} 
                  color="primary"
                  size="small"
                />
              )}
              {!notification.read_at && (
                <Chip 
                  label="Unread" 
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
                Mark as Read
              </Button>
            )}
            <Button
              startIcon={<DeleteIcon />}
              variant="outlined"
              color="error"
              size="small"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </Box>
        </Paper>

        {/* Subject */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom color="primary">
            Subject
          </Typography>
          <Typography variant="body1" sx={{ fontFamily: 'monospace', backgroundColor: 'grey.50', p: 1, borderRadius: 1 }}>
            {notification.subject}
          </Typography>
        </Paper>

        {/* Message */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="h6" color="primary">
              Message
            </Typography>
            <IconButton 
              size="small" 
              onClick={() => handleCopyToClipboard(notification.msg)}
            >
              <CopyIcon />
            </IconButton>
          </Box>
          <TextField
            multiline
            fullWidth
            value={notification.msg || 'No message'}
            InputProps={{
              readOnly: true,
              sx: { fontFamily: 'monospace', fontSize: '0.9rem' }
            }}
            minRows={4}
            maxRows={10}
          />
        </Paper>

        {/* Recipient Information */}
        {notification.recipient && (
          <Paper elevation={1} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom color="primary">
              Recipient
            </Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar>
                <PersonIcon />
              </Avatar>
              <Box>
                <Typography variant="subtitle1">
                  {notification.recipient.fullname || `${notification.recipient.first_name} ${notification.recipient.last_name}`}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {notification.recipient.email}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  ID: {notification.recipient.uuid}
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}

        {/* Timeline */}
        <Paper elevation={1} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom color="primary">
            Timeline
          </Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            <Box display="flex" alignItems="center" gap={2}>
              <ScheduleIcon color="action" />
              <Box>
                <Typography variant="body2">Created</Typography>
                <Typography variant="caption" color="textSecondary">
                  {formatDate(notification.created_at)}
                </Typography>
              </Box>
            </Box>
            {notification.updated_at && (
              <Box display="flex" alignItems="center" gap={2}>
                <ScheduleIcon color="action" />
                <Box>
                  <Typography variant="body2">Last Updated</Typography>
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
                  <Typography variant="body2">Read</Typography>
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
                    Stack Trace
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
                        borderLeft: '2px solid',
                        borderColor: 'primary.main',
                        pl: 1,
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
                    Copy Stack Trace
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
            right: 16, 
            zIndex: 1000 
          }}
        >
          Copied to clipboard!
        </Alert>
      )}
    </Box>
  );
};

export default NotificationPanel;