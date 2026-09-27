import { useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, Paper, Snackbar, Stack, Typography,
} from '@mui/material';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { config } from '../../config.js';
import McpConnect from './McpConnect.jsx';
import McpConsole from './McpConsole.jsx';
import McpAssistant from './McpAssistant.jsx';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const safeAgentPrompt = (skillUrl, readinessUrl, openApiUrl) =>
  `Read the VoipAppz Agent Skill at ${skillUrl}, its readiness reference at ${readinessUrl}, and the live API contract at ${openApiUrl}. Do not guess billing or provisioning rules, and never ask me to paste credentials into this chat.`;

/** The MCP workspace: the assistant, connection recipes and the authenticated tool browser. */
export default function McpWorkspace({ initialQuestion = '' }) {
  const [notice, setNotice] = useState('');
  const apiBaseUrl = config.apiBaseUrl.replace(/\/$/, '');
  const mcpUrl = new URL(`${apiBaseUrl}/api/mcp`, window.location.origin).toString();
  const skillUrl = new URL(`${apiBaseUrl}/tasks/agent-skills/use-voipappz-api/SKILL.md`, window.location.origin).toString();
  const readinessUrl = new URL(`${apiBaseUrl}/tasks/agent-skills/use-voipappz-api/references/integration-status.json`, window.location.origin).toString();
  const openApiUrl = new URL(`${apiBaseUrl}/tasks/openapi.json`, window.location.origin).toString();
  const agentPrompt = safeAgentPrompt(skillUrl, readinessUrl, openApiUrl);

  const copyText = async (value, message) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice('Could not copy to the clipboard.');
    }
  };

  const openAssistant = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    copyText(agentPrompt, 'Agent context copied. Paste it into the assistant.');
  };

  return (
    <Box
      data-testid="mcp-workspace"
      sx={{
        flex: '1 1 0', minHeight: 0, height: '100%', overflowY: 'auto',
        p: { xs: 1.5, sm: 2, md: 3 }, width: '100%', maxWidth: 'none',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        gap={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <HubOutlinedIcon color="primary" />
            <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>MCP</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Connect an agent, browse the tools available to this account, and test JSON-RPC requests.
          </Typography>
        </Box>
        <Chip size="small" variant="outlined" label="JSON-RPC 2.0 over POST" />
      </Stack>

      <Paper
        elevation={0}
        sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}
      >
        <McpAssistant initialQuestion={initialQuestion} />
      </Paper>

      <Paper
        elevation={0}
        sx={{ p: { xs: 1.5, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Quick connect</Typography>
            <Typography variant="caption" color="text.secondary">Claude Code, Claude Desktop, Cursor, and Codex configurations are ready to copy.</Typography>
          </Box>
          <Chip size="small" color="success" variant="outlined" label="MCP ready" />
        </Stack>
        <Typography variant="overline" color="text.secondary">MCP endpoint</Typography>
        <Typography
          data-testid="mcp-workspace-endpoint"
          sx={{ fontFamily: MONO, fontSize: 13, overflowWrap: 'anywhere' }}
        >
          {mcpUrl}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Authorization: Bearer &lt;token&gt; or Basic &lt;email:password&gt;
        </Typography>
        <McpConnect endpointUrl={mcpUrl} copyText={copyText} />
      </Paper>

      <Accordion disableGutters elevation={0} sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 700 }}>No MCP client? Quick connect an AI assistant</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary">
            Copy a credential-free prompt containing only the public Agent Skill, readiness, and OpenAPI URLs.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
            <Button startIcon={<ContentCopyIcon />} variant="outlined" onClick={() => copyText(agentPrompt, 'Agent context copied.')}>Copy AI instructions</Button>
            <Button endIcon={<OpenInNewIcon />} onClick={() => openAssistant('https://chatgpt.com/')}>Open ChatGPT</Button>
            <Button endIcon={<OpenInNewIcon />} onClick={() => openAssistant('https://claude.ai/new')}>Open Claude</Button>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Paper
        elevation={0}
        sx={{ mt: 2, p: { xs: 1.5, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}
      >
        <McpConsole active endpointUrl={mcpUrl} />
      </Paper>

      <Snackbar open={Boolean(notice)} autoHideDuration={2500} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
