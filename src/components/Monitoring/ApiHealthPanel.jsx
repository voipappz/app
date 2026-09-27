import { useCallback, useEffect, useState } from 'react';
import { Box, Typography, Chip, Button, CircularProgress, Alert } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import { metricsApi } from '../../services/api/metricsApi';

/**
 * ApiHealthPanel — the API health view (HTTP status, health checks, raw
 * response). It fetches the authenticated /health/detailed endpoint only while
 * mounted (the top-bar mounts it when the operator opens the Health dialog).
 */
// `focus`: a service to open on (its /health?verbose entry and its detailed
// check); `summary`: the /health?verbose payload the page already polls.
const ApiHealthPanel = ({ focus = null, summary = null }) => {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await metricsApi.getDetailedHealth());
    } catch (err) {
      if (err?.data) setResponse(err.data);
      setError(err?.message || 'Detailed health check failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const isHealthy = response?.healthy === true || ['healthy', 'ok'].includes(response?.status);

  return (
    <Box sx={{ p: 2, border: '1px solid var(--theme-border)', borderRadius: '8px', bgcolor: 'var(--widget-content-bg)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <CircleIcon sx={{ fontSize: 18, color: isHealthy ? '#4caf50' : '#f44336' }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>API detailed health</Typography>
        <Button size="small" onClick={refresh} disabled={loading}>
          {loading ? <CircularProgress size={16} /> : 'Refresh'}
        </Button>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {focus && (
        <Box sx={{ mb: 2 }} data-testid="health-focus">
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{focus.replace(/_/g, ' ')}</Typography>
          <Box sx={{ p: 1.5, bgcolor: 'var(--theme-bg-secondary)', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify({
              summary: summary?.checks?.[focus] ?? (focus === 'api' ? summary : undefined) ?? null,
              detailed: response?.checks?.[focus] ?? null,
            }, null, 2)}
          </Box>
        </Box>
      )}

      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>HTTP Status</Typography>
          <Chip label={response?.http_status || 'N/A'} color={isHealthy ? 'success' : 'error'} size="small" />
        </Box>
        {response?.status && (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>Health Status</Typography>
            <Chip label={response.status} color={isHealthy ? 'success' : 'error'} size="small" />
          </Box>
        )}
      </Box>

      {response?.checks && Object.keys(response.checks).length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>Health Checks</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Object.entries(response.checks).map(([checkName, checkData]) => {
              const ok = checkData?.healthy || checkData?.status === 'healthy' || checkData?.ok;
              return (
                <Box key={checkName} sx={{ p: 1.5, bgcolor: ok ? '#e8f5e9' : '#ffebee', borderRadius: 1, border: '1px solid', borderColor: ok ? '#a5d6a7' : '#ef9a9a' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircleIcon sx={{ fontSize: 12, color: ok ? '#4caf50' : '#f44336' }} />
                    <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>{checkName.replace(/_/g, ' ')}</Typography>
                    {(checkData?.latency_ms || checkData?.ms) && <Chip label={`${checkData.latency_ms || checkData.ms}ms`} size="small" sx={{ ml: 'auto', height: 20, fontSize: '10px' }} />}
                  </Box>
                  {checkData?.message && <Typography variant="caption" color="text.secondary" sx={{ ml: 2.5, display: 'block' }}>{checkData.message}</Typography>}
                  {checkData?.error && <Typography variant="caption" color="error" sx={{ ml: 2.5, display: 'block' }}>{checkData.error}</Typography>}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Box>
        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>Raw Response</Typography>
        <Box sx={{ p: 2, bgcolor: 'var(--theme-bg-secondary)', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
          {typeof response === 'object' && response ? JSON.stringify(response, null, 2) : response || 'No response'}
        </Box>
      </Box>
    </Box>
  );
};

export default ApiHealthPanel;
