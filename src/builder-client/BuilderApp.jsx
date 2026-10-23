import { useState } from 'react';
import { Box, Button, IconButton, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCommentIcon from '@mui/icons-material/AddComment';
import { ChatView } from '@voipappz/chat-ui';
import { useBuilderChat } from './useBuilderChat';

const SUGGESTIONS = [
  { label: 'Find the call history screen', prompt: 'Find the component that renders the call history list and tell me its file and line.' },
  { label: 'Explain the extensions screen', prompt: 'Explain how the extensions screen loads and shows its data.' }
];

const STATUS_COLOR = { ok: 'var(--color-success)', error: 'var(--color-danger)', neutral: 'var(--theme-text-tertiary)' };

function PermissionBar({ permission, onAnswer }) {
  const { toolCall, options = [] } = permission.params || {};
  return (
    <Box data-testid="builder-permission" sx={{ p: 1.5, borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-bg-secondary)' }}>
      <Typography sx={{ fontSize: '0.85rem', color: 'var(--theme-text-primary)', mb: 1 }}>
        The agent asks to run: <strong>{toolCall?.title || 'a tool'}</strong>
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <Button
            key={option.optionId}
            size="small"
            variant={option.kind?.startsWith('allow') ? 'contained' : 'outlined'}
            color={option.kind?.startsWith('reject') ? 'error' : 'primary'}
            onClick={() => onAnswer(option.optionId)}
          >
            {option.name}
          </Button>
        ))}
      </Box>
    </Box>
  );
}

function Previews({ previews }) {
  const [role, setRole] = useState('admin');
  const [reloadKey, setReloadKey] = useState(0);
  const url = previews[role];

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderLeft: '1px solid var(--theme-border)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-bg-secondary)' }}>
        <Tabs value={role} onChange={(_, value) => setRole(value)} sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}>
          <Tab value="admin" label="Admin" />
          <Tab value="user" label="User" />
        </Tabs>
        <Typography sx={{ flex: 1, ml: 2, fontSize: '0.75rem', color: 'var(--theme-text-tertiary)', fontFamily: 'monospace' }} noWrap>
          {url}
        </Typography>
        <Tooltip title="Reload preview">
          <IconButton size="small" onClick={() => setReloadKey((k) => k + 1)}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Open in a new tab">
          <IconButton size="small" component="a" href={url} target="_blank" rel="noreferrer"><OpenInNewIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Box>
      {/* Both stay mounted so each keeps its own login while switching tabs. */}
      {['admin', 'user'].map((name) => (
        <Box
          key={`${name}-${reloadKey}`}
          component="iframe"
          title={`${name} preview`}
          src={previews[name]}
          sx={{ flex: 1, border: 0, display: role === name ? 'block' : 'none', backgroundColor: '#fff' }}
        />
      ))}
    </Box>
  );
}

export default function BuilderApp({ info }) {
  const chat = useBuilderChat(info);
  const [input, setInput] = useState('');

  const send = (text) => {
    chat.send(text ?? input);
    setInput('');
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', backgroundColor: 'var(--theme-bg-primary)' }}>
      <Box sx={{ width: '42%', minWidth: 380, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: '1px solid var(--theme-border)' }}>
          <Box component="img" src={`${info.clientUrl}/images/VA_logo_blue.png`} alt="VoipAppz" sx={{ height: 22 }} />
          <Typography sx={{ fontWeight: 600, color: 'var(--theme-text-primary)' }}>Builder</Typography>
          <Typography sx={{ flex: 1, fontSize: '0.75rem', color: 'var(--theme-text-tertiary)', fontFamily: 'monospace' }} noWrap title={info.workspace}>
            {info.workspaceName}
          </Typography>
          <Tooltip title="New conversation">
            <span>
              <IconButton size="small" onClick={chat.newSession} disabled={chat.busy}><AddCommentIcon fontSize="small" /></IconButton>
            </span>
          </Tooltip>
        </Box>
        {chat.permission && <PermissionBar permission={chat.permission} onAnswer={chat.answerPermission} />}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ChatView
            title={info.agent}
            subtitle={
              <Box component="span" sx={{ color: STATUS_COLOR[chat.status.tone] }}>
                {chat.status.label}
                {info.apiMcp ? ` · API tools: ${info.apiUrl}` : ' · API tools off'}
              </Box>
            }
            messages={chat.messages}
            busy={chat.busy}
            inputValue={input}
            onInputChange={setInput}
            onSend={send}
            onStop={chat.stop}
            emptyState={{
              title: 'What should we build?',
              description: `The agent works in ${info.workspaceName}. Changes show in the previews.`,
              suggestions: SUGGESTIONS,
              onSuggestion: send
            }}
          />
        </Box>
      </Box>
      <Previews previews={info.previews} />
    </Box>
  );
}
