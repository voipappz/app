import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { apiService } from '../../services/apiService';
import { askMcpAssistant, listMcpTools, ASSISTANT_CAN_ANSWER, SUGGESTIONS } from '../../services/mcpAssistant';

const GREETING = `Hi. Ask me about ${ASSISTANT_CAN_ANSWER}.`;

/**
 * The portal's MCP assistant, in the MCP workspace: a chat over the account's
 * (or user's) own /api/mcp tools. No LLM — a question maps to one read-only
 * tool and the answer is composed from what it returns (services/mcpAssistant).
 */
export default function McpAssistant({ initialQuestion = '' }) {
  const [connection, setConnection] = useState({ loading: true, error: '' });
  const [question, setQuestion] = useState(initialQuestion);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: GREETING }]);
  const endRef = useRef(null);

  const connect = useCallback(async () => {
    setConnection({ loading: true, error: '' });
    try {
      await listMcpTools(apiService.getToken());
      setConnection({ loading: false, error: '' });
    } catch (error) {
      setConnection({ loading: false, error: error.message || 'Could not connect to the MCP tools.' });
    }
  }, []);

  useEffect(() => { connect(); }, [connect]);
  useEffect(() => { setQuestion(initialQuestion || ''); }, [initialQuestion]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [messages, running]);

  const ask = async (value) => {
    const asked = String(value || '').trim();
    if (!asked || running) return;
    setQuestion('');
    setMessages((current) => [...current, { role: 'user', text: asked }]);
    setRunning(true);
    try {
      const { text, details } = await askMcpAssistant(apiService.getToken(), asked);
      setMessages((current) => [...current, { role: 'assistant', text, details: details || null }]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Box data-testid="mcp-assistant" sx={{ display: 'flex', flexDirection: 'column', minHeight: 320, maxHeight: '60vh' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 700 }}>Assistant</Typography>
          <Typography variant="caption" color="text.secondary">Answers from your own MCP tools, scoped to this session.</Typography>
        </Box>
        {connection.loading
          ? <CircularProgress size={16} />
          : <Chip size="small" color={connection.error ? 'error' : 'success'} variant="outlined" label={connection.error ? 'Disconnected' : 'Connected'} />}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        {connection.error && (
          <Alert severity="error" sx={{ mb: 1.5 }} action={<Button onClick={connect}>Retry</Button>}>{connection.error}</Alert>
        )}
        {messages.map((message, index) => (
          <Box key={`${message.role}-${index}`} sx={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', mb: 1.25 }}>
            <Paper
              elevation={0}
              sx={{
                maxWidth: '88%', px: 1.75, py: 1.25,
                bgcolor: message.role === 'user' ? 'primary.main' : 'action.hover',
                color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
                borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              }}
            >
              <Typography variant="body2" role={message.role === 'assistant' && index > 0 ? 'status' : undefined}>{message.text}</Typography>
              {message.details && (
                <Box component="details" sx={{ mt: 1 }}>
                  <Typography component="summary" variant="caption" sx={{ cursor: 'pointer' }}>View details</Typography>
                  <Box component="pre" sx={{ m: 0, mt: 1, overflow: 'auto', fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(message.details, null, 2)}
                  </Box>
                </Box>
              )}
            </Paper>
          </Box>
        ))}
        {running && <CircularProgress size={20} sx={{ ml: 1 }} aria-label="Asking" />}
        <Box ref={endRef} />
      </Box>

      <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 0.75, mb: 1, overflowX: 'auto', pb: 0.25 }}>
          {SUGGESTIONS.map((suggestion) => (
            <Chip key={suggestion} label={suggestion} size="small" variant="outlined" onClick={() => ask(suggestion)} sx={{ flexShrink: 0 }} />
          ))}
        </Box>
        <Box component="form" onSubmit={(event) => { event.preventDefault(); ask(question); }} sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth size="small" value={question} autoFocus
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about your calls, devices or logs…"
            inputProps={{ 'aria-label': 'Ask the assistant' }}
            disabled={running}
          />
          <Button type="submit" variant="contained" disabled={!question.trim() || running} aria-label="Send question">
            <SendRoundedIcon />
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
