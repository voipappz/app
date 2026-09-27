import React from 'react';
import { Box, Typography, Button, Alert, Paper } from '@mui/material';
import { Refresh as RefreshIcon, Home as HomeIcon } from '@mui/icons-material';

// A lazy screen whose file could not be downloaded: Chrome, Safari and Firefox
// word it differently. It is a network/deploy problem, not a bug in the page.
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i;

export function describeError(error, online = typeof navigator === 'undefined' ? true : navigator.onLine) {
  const message = String(error?.message || error || '');
  if (CHUNK_ERROR.test(message) || error?.name === 'ChunkLoadError') {
    const file = (message.match(/[\w.-]+\.js/) || [])[0] || null;
    return {
      kind: 'network',
      title: "Couldn't load this screen",
      body: online
        ? 'Part of the app could not be downloaded. The connection may have dropped for a moment, or a new version was just released. Reloading the page fetches the current version.'
        : 'You appear to be offline, so part of the app could not be downloaded. Check your connection, then reload.',
      detail: file ? `Missing file: ${file}` : message,
    };
  }
  return {
    kind: 'app',
    title: 'Oops! Something went wrong',
    body: "We're sorry, but there was an unexpected error. Please try refreshing the page or go back to the home screen.",
    detail: message || null,
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // The error is kept now, so the first fallback render already knows which
    // message to show.
    return {
      hasError: true,
      error,
      errorId: Date.now() // Unique ID for this error instance
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    this.setState({
      error,
      errorInfo
    });

    // Log to console for development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // In production, you could send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }
  }

  logErrorToService = (error, errorInfo) => {
    // Placeholder for error reporting service integration
    // Could integrate with Sentry, LogRocket, Bugsnag, etc.
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: this.getUserId()
      };

      // Send to error reporting service
      console.log('Would send to error service:', errorData);
      
      // Example: fetch('/api/errors', { method: 'POST', body: JSON.stringify(errorData) });
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
  };

  getUserId = () => {
    try {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.user?.id || 'anonymous';
      }
    } catch {
      // Ignore parsing errors
    }
    return 'anonymous';
  };

  handleRefresh = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const described = describeError(this.state.error);
      const isNetwork = described.kind === 'network';

      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            backgroundColor: 'var(--mui-palette-surface-muted)'
          }}
        >
          <Paper 
            elevation={3} 
            sx={{ 
              p: 4, 
              maxWidth: 600, 
              width: '100%',
              textAlign: 'center'
            }}
          >
            <Typography variant="h4" color={isNetwork ? 'warning.main' : 'error'} gutterBottom>
              {described.title}
            </Typography>

            <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
              {described.body}
            </Typography>

            <Alert severity={isNetwork ? 'warning' : 'error'} sx={{ mb: 3, textAlign: 'left' }}>
              <Typography variant="subtitle2">Error ID: {this.state.errorId}</Typography>
              {!isDevelopment && described.detail && (
                <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                  {described.detail}
                </Typography>
              )}
              {isDevelopment && this.state.error && (
                <>
                  <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace' }}>
                    {this.state.error.message}
                  </Typography>
                  {this.state.error.stack && (
                    <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {this.state.error.stack}
                    </Typography>
                  )}
                </>
              )}
            </Alert>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              {isNetwork && (
                <Button variant="contained" color="primary" startIcon={<RefreshIcon />} onClick={this.handleReload}>
                  Reload page
                </Button>
              )}
              {!isNetwork && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<RefreshIcon />}
                onClick={this.handleRefresh}
              >
                Try Again
              </Button>
              )}

              <Button
                variant="outlined"
                color="primary"
                startIcon={<HomeIcon />}
                onClick={this.handleGoHome}
              >
                Go Home
              </Button>
              
              {!isNetwork && (
              <Button
                variant="outlined"
                color="secondary"
                onClick={this.handleReload}
              >
                Reload Page
              </Button>
              )}
            </Box>

            {isDevelopment && this.state.errorInfo && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Component Stack (Development Only):
                </Typography>
                <Alert severity="info">
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {this.state.errorInfo.componentStack}
                  </Typography>
                </Alert>
              </Box>
            )}
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;