import { useState, useEffect, lazy, Suspense } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  InputAdornment,
  Divider,
  CircularProgress,
  Alert,
  Skeleton,
  Tooltip,
  Tab,
  Tabs,
} from '@mui/material';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import EditIcon from '@mui/icons-material/Edit';
import PhoneIcon from '@mui/icons-material/Phone';
import DialpadIcon from '@mui/icons-material/Dialpad';
import CallEndIcon from '@mui/icons-material/CallEnd';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import PsychologyIcon from '@mui/icons-material/Psychology';
import BoltIcon from '@mui/icons-material/Bolt';
import CodeIcon from '@mui/icons-material/Code';
import ChatIcon from '@mui/icons-material/Chat';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import FolderIcon from '@mui/icons-material/Folder';
import EventsIcon from '@mui/icons-material/EventNote';

import { useBots } from './Bots.js';
import { usePermissions } from '../../hooks/usePermissions';
import { CodeEditor } from '../Bridges/VMLBridge/CodeEditor.jsx';

// AI Assistant — embedded as a right-side chat in the bot edit view (lazy so it
// stays out of the Bots bundle until you open a bot).
const AIChat = lazy(() => import('../AIChat/AIChat.jsx'));
import './Bots.css';

const Bots = () => {
  const {
    bots,
    setSelectedBot,
    isCreateOpen,
    setIsCreateOpen,
    loading,
    createBot,
    deleteBot,
    deployBot,
    selectedProject,
    // Chat testing
    chatMessages,
    chatLoading,
    chatSessionId,
    sendChatMessage,
    clearChat,
    // BotReply CRUD
    replies,
    repliesLoading,
    fetchReplies,
    createReply,
    updateReply: updateReplyFn,
    deleteReply,
    // Preview
    previewBot,
    validation,
    // Settings
    updateBotField,
    saveBot,
    fetchProjects,
  } = useBots();

  const { can } = usePermissions();
  const canWrite = can('bots', 'write');

  const [search, setSearch] = useState('');
  const [newBotName, setNewBotName] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuBot, setMenuBot] = useState(null);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // Chat testing state
  const [chatInput, setChatInput] = useState('');
  const [showInspect, setShowInspect] = useState(false);

  // Reply dialog state
  const [replyDialog, setReplyDialog] = useState(false);
  const [editingReply, setEditingReply] = useState(null);
  const [replyForm, setReplyForm] = useState({ state_name: '', reply_type: 'speech', flow_name: 'main', content: {} });
  const [previewLua, setPreviewLua] = useState(null);

  // Quick test suggestions
  const testSuggestions = ['Hello', 'Help', 'Sales', 'Support', 'Hours', 'Pricing'];

  // Fetch replies when bot is selected and Replies tab is active
  useEffect(() => {
    if (selectedProject?.uuid && activeTab === 0) {
      fetchReplies(selectedProject.uuid);
    }
  }, [selectedProject?.uuid, activeTab, fetchReplies]);

  // Listen for environment change events to refresh data
  useEffect(() => {
    const handleEnvironmentChange = () => fetchProjects();
    window.addEventListener('environmentChanged', handleEnvironmentChange);
    return () => window.removeEventListener('environmentChanged', handleEnvironmentChange);
  }, [fetchProjects]);

  const handleSendMessage = () => {
    if (chatInput.trim()) {
      sendChatMessage(chatInput.trim());
      setChatInput('');
    }
  };

  const filteredBots = bots.filter(bot =>
    bot.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (newBotName.trim()) {
      createBot(newBotName.trim());
      setNewBotName('');
    }
  };

  const handleMenuOpen = (event, bot) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuBot(bot);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuBot(null);
  };

  const handleDelete = () => {
    if (menuBot) deleteBot(menuBot.id);
    handleMenuClose();
  };

  const timeAgo = (date) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Bot Detail View (tab-based)
  if (selectedProject) {
    return (
      <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <Box className="bots-detail-container" sx={{ flex: 1, minWidth: 0 }}>
        {/* Top Bar */}
        <Box className="bots-topbar">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={() => setSelectedBot(null)} sx={{ color: 'var(--mui-palette-text-secondary)' }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <SmartToyIcon sx={{ color: '#3b82f6', fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {selectedProject.name}
            </Typography>
            <Chip
              label={selectedProject.status}
              size="small"
              sx={{
                height: 20,
                fontSize: 11,
                bgcolor: selectedProject.status === 'active' ? '#dcfce7' : selectedProject.status === 'paused' ? '#fef3c7' : '#f3f4f6',
                color: selectedProject.status === 'active' ? '#16a34a' : selectedProject.status === 'paused' ? '#d97706' : '#6b7280',
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {canWrite && (
              <Button
                size="small"
                variant="contained"
                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RocketLaunchIcon />}
                onClick={() => deployBot(selectedProject.id)}
                disabled={loading}
                sx={{
                  textTransform: 'none',
                  bgcolor: '#3b82f6',
                  '&:hover': { bgcolor: '#2563eb' }
                }}
              >
                {loading ? 'Deploying...' : 'Deploy'}
              </Button>
            )}
          </Box>
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ minHeight: 40 }}
          >
            <Tab
              icon={<PlaylistAddIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label="Replies"
              sx={{ textTransform: 'none', minHeight: 40, py: 0 }}
            />
            <Tab
              icon={<ChatIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label="Test"
              sx={{ textTransform: 'none', minHeight: 40, py: 0 }}
            />
            <Tab
              icon={<SettingsIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label="Settings"
              sx={{ textTransform: 'none', minHeight: 40, py: 0 }}
            />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>

          {/* ── Replies Tab ── */}
          {activeTab === 0 && (
            <Box sx={{ p: 2 }}>
              {validation && !validation.valid && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {validation.errors.map((error) => `${error.path}: ${error.message}`).join(' · ')}
                </Alert>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Bot Replies</Typography>
                  <Chip label={`${replies.length} states`} size="small" sx={{ height: 22, fontSize: 11 }} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Preview Lua">
                    <IconButton size="small" onClick={async () => {
                      const botId = selectedProject?.uuid;
                      if (botId) {
                        try {
                          const result = await previewBot(botId);
                          setPreviewLua(result?.lua || 'No Lua generated');
                        } catch { setPreviewLua('Preview failed'); }
                      }
                    }} sx={{ color: 'var(--mui-palette-text-secondary)' }}>
                      <CodeIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                  {canWrite && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => {
                        setEditingReply(null);
                        setReplyForm({ state_name: '', reply_type: 'speech', flow_name: 'main', content: {} });
                        setReplyDialog(true);
                      }}
                      sx={{ textTransform: 'none' }}
                    >
                      Add State
                    </Button>
                  )}
                </Box>
              </Box>

              {repliesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={28} /></Box>
              ) : replies.length === 0 ? (
                <Paper sx={{ textAlign: 'center', p: 4, color: 'var(--mui-palette-text-secondary)' }}>
                  <PlaylistAddIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                  <Typography variant="body2" sx={{ mb: 1 }}>No states defined</Typography>
                  <Typography variant="caption">Add states to build the IVR flow</Typography>
                </Paper>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {replies.map((reply, idx) => {
                    const typeIcons = {
                      speech: <PhoneIcon sx={{ fontSize: 14, color: '#10b981' }} />,
                      dtmf: <DialpadIcon sx={{ fontSize: 14, color: '#3b82f6' }} />,
                      action: <BoltIcon sx={{ fontSize: 14, color: '#f59e0b' }} />,
                      transfer: <CallSplitIcon sx={{ fontSize: 14, color: '#8b5cf6' }} />,
                      hangup: <CallEndIcon sx={{ fontSize: 14, color: '#ef4444' }} />,
                      llm: <PsychologyIcon sx={{ fontSize: 14, color: '#ec4899' }} />,
                    };
                    const content = reply.content || {};
                    const transitions = content.transitions || [];
                    return (
                      <Paper key={reply.uuid} variant="outlined" sx={{ p: 1.5, bgcolor: 'var(--mui-palette-surface-muted)', '&:hover': { bgcolor: '#f0f0f0' } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', width: 20 }}>{idx + 1}</Typography>
                          {typeIcons[reply.reply_type] || <BoltIcon sx={{ fontSize: 14 }} />}
                          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', flex: 1 }}>
                            {reply.state_name}
                          </Typography>
                          <Chip label={reply.reply_type} size="small" sx={{ height: 18, fontSize: 10 }} />
                          {reply.flow_name && reply.flow_name !== 'main' && (
                            <Chip
                              icon={<FolderIcon sx={{ fontSize: 12 }} />}
                              label={reply.flow_name}
                              size="small"
                              variant="outlined"
                              sx={{ height: 18, fontSize: 10 }}
                            />
                          )}
                          {canWrite && (
                            <>
                              <IconButton size="small" onClick={() => {
                                setEditingReply(reply);
                                setReplyForm({
                                  state_name: reply.state_name,
                                  reply_type: reply.reply_type,
                                  flow_name: reply.flow_name || 'main',
                                  content: reply.content || {},
                                });
                                setReplyDialog(true);
                              }}>
                                <EditIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                              <IconButton size="small" onClick={() => deleteReply(selectedProject?.uuid, reply.uuid)}>
                                <DeleteIcon sx={{ fontSize: 14, color: '#ef4444' }} />
                              </IconButton>
                            </>
                          )}
                        </Box>
                        {content.text && (
                          <Typography variant="caption" sx={{ ml: 5, color: 'var(--mui-palette-text-secondary)', display: 'block', mt: 0.5 }}>
                            &quot;{content.text.substring(0, 80)}{content.text.length > 80 ? '...' : ''}&quot;
                          </Typography>
                        )}
                        {transitions.length > 0 && (
                          <Box sx={{ ml: 5, mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {transitions.map((t, ti) => (
                              <Chip
                                key={ti}
                                label={t.from ? `${t.from} → ${t.to}` : t.condition ? `${t.condition} → ${t.to}` : `→ ${t.to}`}
                                size="small"
                                variant="outlined"
                                sx={{ height: 18, fontSize: 10, fontFamily: 'monospace' }}
                              />
                            ))}
                          </Box>
                        )}
                      </Paper>
                    );
                  })}
                </Box>
              )}

              {/* Lua Preview */}
              {previewLua && (
                <Paper variant="outlined" sx={{ mt: 2, overflow: 'hidden', bgcolor: '#1a1d23' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 0.5 }}>
                    <Typography variant="caption" sx={{ color: '#10b981' }}>Generated Lua</Typography>
                    <IconButton size="small" onClick={() => setPreviewLua(null)} sx={{ color: 'var(--mui-palette-text-secondary)' }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                  <CodeEditor value={previewLua} language="lua" height="350px" readOnly={true} />
                </Paper>
              )}
            </Box>
          )}

          {/* ── Test Tab ── */}
          {activeTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 500 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: '1px solid var(--mui-palette-divider)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SmartToyIcon sx={{ fontSize: 18, color: '#10b981' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Test Console{chatSessionId ? ` · ${chatSessionId.slice(0, 12)}…` : ''}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Tooltip title={showInspect ? 'Hide JSON' : 'Inspect JSON'}>
                    <IconButton size="small" onClick={() => setShowInspect(!showInspect)} sx={{ color: showInspect ? '#3b82f6' : '#888' }}>
                      {showInspect ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Clear Chat">
                    <IconButton size="small" onClick={clearChat} sx={{ color: 'var(--mui-palette-text-secondary)' }}>
                      <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {/* Quick Test Suggestions */}
              <Box className="bots-chat-suggestions">
                <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', mr: 1 }}>Quick test:</Typography>
                {testSuggestions.map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    size="small"
                    onClick={() => sendChatMessage(suggestion)}
                    sx={{
                      height: 22,
                      fontSize: 11,
                      cursor: 'pointer',
                      bgcolor: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.2)' }
                    }}
                  />
                ))}
              </Box>

              {/* Chat Messages */}
              <Box className="bots-chat-messages" sx={{ flex: 1 }}>
                {chatMessages.length === 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--mui-palette-text-secondary)', p: 3 }}>
                    <SmartToyIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
                    <Typography variant="body2" sx={{ textAlign: 'center', mb: 1 }}>
                      Test your bot conversation
                    </Typography>
                    <Typography variant="caption" sx={{ textAlign: 'center', opacity: 0.7 }}>
                      Send a message or use quick test buttons above
                    </Typography>
                  </Box>
                ) : (
                  chatMessages.map((msg) => (
                    <Box key={msg.id} className={`bots-chat-message ${msg.role}`}>
                      <Box className="bots-chat-avatar">
                        {msg.role === 'user' ? (
                          <PersonIcon sx={{ fontSize: 16 }} />
                        ) : (
                          <SmartToyIcon sx={{ fontSize: 16 }} />
                        )}
                      </Box>
                      <Box className="bots-chat-bubble">
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </Typography>
                        {showInspect && (
                          <Box className="bots-chat-inspect">
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--mui-palette-text-secondary)' }}>
                              {JSON.stringify(msg.result || {
                                role: msg.role,
                                content: msg.content,
                                timestamp: msg.timestamp,
                                error: msg.error || undefined,
                              }, null, 2)}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  ))
                )}
                {chatLoading && (
                  <Box className="bots-chat-message assistant">
                    <Box className="bots-chat-avatar">
                      <SmartToyIcon sx={{ fontSize: 16 }} />
                    </Box>
                    <Box className="bots-chat-bubble">
                      <CircularProgress size={16} sx={{ color: '#10b981' }} />
                    </Box>
                  </Box>
                )}
              </Box>

              {/* Chat Input */}
              <Box className="bots-chat-input">
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Type a message to test..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  disabled={chatLoading}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '20px',
                      bgcolor: 'var(--mui-palette-surface-muted)',
                      '& fieldset': { border: 'none' },
                    },
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={handleSendMessage}
                          disabled={!chatInput.trim() || chatLoading}
                          sx={{ color: chatInput.trim() ? '#3b82f6' : '#ccc' }}
                        >
                          <SendIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            </Box>
          )}

          {/* ── Settings Tab ── */}
          {activeTab === 2 && (
            <Box className="bots-settings">
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>Bot Settings</Typography>

              {/* ── General ── */}
              <Box className="bots-settings-section">
                <TextField
                  fullWidth
                  label="Bot Name"
                  value={selectedProject?.name || ''}
                  onChange={(e) => updateBotField('name', e.target.value)}
                  sx={{ mb: 2 }}
                />

                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={selectedProject?.enabled !== false}
                        onChange={(e) => updateBotField('enabled', e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Enabled"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={selectedProject?.profile?.realtime_enabled === true}
                        onChange={(e) => updateBotField('profile.realtime_enabled', e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Realtime voice"
                  />
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Enables the deployed LLM media path for this bot. Deterministic states remain local in Lua.
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Notes"
                  value={selectedProject?.notes || ''}
                  onChange={(e) => updateBotField('notes', e.target.value)}
                  sx={{ mb: 2 }}
                />
              </Box>

              {/* Save Button */}
              {canWrite && (
                <>
                  <Divider sx={{ my: 3 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                      disabled={loading}
                      onClick={() => saveBot(selectedProject?.id)}
                      sx={{ textTransform: 'none' }}
                    >
                      {loading ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </Box>
                </>
              )}
            </Box>
          )}

        </Box>

        {/* Reply Add/Edit Dialog */}
        <Dialog open={replyDialog} onClose={() => setReplyDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingReply ? 'Edit State' : 'Add State'}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="State Name"
              value={replyForm.state_name}
              onChange={(e) => setReplyForm(prev => ({ ...prev, state_name: e.target.value.replace(/\W/g, '_') }))}
              placeholder="welcome"
              sx={{ mt: 1, mb: 2 }}
              helperText="Unique identifier (e.g., welcome, menu, goodbye)"
              inputProps={{ style: { fontFamily: 'monospace' } }}
            />
            <TextField
              fullWidth
              label="Flow Name"
              value={replyForm.flow_name || 'main'}
              onChange={(e) => setReplyForm(prev => ({ ...prev, flow_name: e.target.value.replace(/\W/g, '_') || 'main' }))}
              placeholder="main"
              sx={{ mb: 2 }}
              helperText="Flow group (default: main)"
              inputProps={{ style: { fontFamily: 'monospace' } }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Reply Type</InputLabel>
              <Select
                native
                value={replyForm.reply_type}
                onChange={(e) => {
                  const type = e.target.value;
                  const defaults = {
                    speech: { text: '', transitions: [{ to: '' }] },
                    dtmf: { text: '', max_digits: 1, timeout: 10, transitions: [] },
                    action: { action_name: '', transitions: [] },
                    transfer: { text: '', bridge_type: 'queue', bridge_uuid: '' },
                    hangup: { text: '', cause: 'NORMAL_CLEARING' },
                    llm: { prompt: '', tools: [], next: '', fails_to: 'catch_all', realtime: { mode: 'stt_llm_tts', allow_interrupt: true, silence_timeout_ms: 10000 } },
                  };
                  setReplyForm(prev => ({ ...prev, reply_type: type, content: defaults[type] || {} }));
                }}
                label="Reply Type"
              >
                <option value="speech">speech — TTS playback</option>
                <option value="dtmf">dtmf — DTMF menu</option>
                <option value="action">action — API condition</option>
                <option value="transfer">transfer — route call</option>
                <option value="hangup">hangup — end call</option>
                <option value="llm">llm — Ragents AI + tools</option>
              </Select>
            </FormControl>

            {/* Structured content fields per reply type */}
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', mb: 1, display: 'block' }}>Content</Typography>

            {/* Speech fields */}
            {replyForm.reply_type === 'speech' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Text (TTS)"
                  value={replyForm.content?.text || ''}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, text: e.target.value } }))}
                  placeholder="Welcome to our system. How can I help you?"
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  label="Next State"
                  value={replyForm.content?.transitions?.[0]?.to || ''}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions: [{ to: e.target.value }] } }))}
                  placeholder="menu"
                  helperText="State to transition to after speech"
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                />
              </>
            )}

            {/* DTMF fields */}
            {replyForm.reply_type === 'dtmf' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Prompt Text (TTS)"
                  value={replyForm.content?.text || ''}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, text: e.target.value } }))}
                  placeholder="Press 1 for sales, 2 for support"
                  sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField
                    label="Max Digits"
                    type="number"
                    value={replyForm.content?.max_digits ?? 1}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, max_digits: parseInt(e.target.value) || 1 } }))}
                    size="small"
                    sx={{ width: 120 }}
                  />
                  <TextField
                    label="Timeout (sec)"
                    type="number"
                    value={replyForm.content?.timeout ?? 10}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, timeout: parseInt(e.target.value) || 10 } }))}
                    size="small"
                    sx={{ width: 120 }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', mb: 1, display: 'block' }}>
                  Transitions (digit → next state)
                </Typography>
                {(replyForm.content?.transitions || []).map((t, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      label="Digit"
                      value={t.from || ''}
                      onChange={(e) => {
                        const transitions = [...(replyForm.content?.transitions || [])];
                        transitions[i] = { ...transitions[i], from: e.target.value };
                        setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                      }}
                      size="small"
                      sx={{ width: 80 }}
                      inputProps={{ style: { fontFamily: 'monospace' } }}
                    />
                    <Typography variant="body2" sx={{ color: 'var(--mui-palette-text-secondary)' }}>→</Typography>
                    <TextField
                      label="Next State"
                      value={t.to || ''}
                      onChange={(e) => {
                        const transitions = [...(replyForm.content?.transitions || [])];
                        transitions[i] = { ...transitions[i], to: e.target.value };
                        setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                      }}
                      size="small"
                      sx={{ flex: 1 }}
                      inputProps={{ style: { fontFamily: 'monospace' } }}
                    />
                    <IconButton size="small" onClick={() => {
                      const transitions = (replyForm.content?.transitions || []).filter((_, j) => j !== i);
                      setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                    }}>
                      <DeleteIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const transitions = [...(replyForm.content?.transitions || []), { from: '', to: '' }];
                    setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  Add Transition
                </Button>
              </>
            )}

            {/* Action fields */}
            {replyForm.reply_type === 'action' && (
              <>
                <TextField
                  fullWidth
                  label="Action Name"
                  value={replyForm.content?.action_name || ''}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, action_name: e.target.value } }))}
                  placeholder="check_balance"
                  sx={{ mb: 2 }}
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                  helperText="API action to execute (e.g., check_balance, validate_pin)"
                />
                <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', mb: 1, display: 'block' }}>
                  Transitions (condition → next state)
                </Typography>
                {(replyForm.content?.transitions || []).map((t, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      label="Condition"
                      value={t.condition || ''}
                      onChange={(e) => {
                        const transitions = [...(replyForm.content?.transitions || [])];
                        transitions[i] = { ...transitions[i], condition: e.target.value };
                        setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                      }}
                      size="small"
                      sx={{ flex: 1 }}
                      inputProps={{ style: { fontFamily: 'monospace' } }}
                      placeholder="success"
                    />
                    <Typography variant="body2" sx={{ color: 'var(--mui-palette-text-secondary)' }}>→</Typography>
                    <TextField
                      label="Next State"
                      value={t.to || ''}
                      onChange={(e) => {
                        const transitions = [...(replyForm.content?.transitions || [])];
                        transitions[i] = { ...transitions[i], to: e.target.value };
                        setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                      }}
                      size="small"
                      sx={{ flex: 1 }}
                      inputProps={{ style: { fontFamily: 'monospace' } }}
                      placeholder="next_step"
                    />
                    <IconButton size="small" onClick={() => {
                      const transitions = (replyForm.content?.transitions || []).filter((_, j) => j !== i);
                      setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                    }}>
                      <DeleteIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const transitions = [...(replyForm.content?.transitions || []), { condition: '', to: '' }];
                    setReplyForm(prev => ({ ...prev, content: { ...prev.content, transitions } }));
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  Add Transition
                </Button>
              </>
            )}

            {/* Transfer fields */}
            {replyForm.reply_type === 'transfer' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Text (TTS before transfer)"
                  value={replyForm.content?.text || ''}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, text: e.target.value } }))}
                  placeholder="Please hold while I transfer you"
                  sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <FormControl sx={{ minWidth: 150 }}>
                    <InputLabel>Bridge Type</InputLabel>
                    <Select
                      native
                      value={replyForm.content?.bridge_type || 'queue'}
                      onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, bridge_type: e.target.value } }))}
                      label="Bridge Type"
                      size="small"
                    >
                      <option value="queue">Queue</option>
                      <option value="extension">Device</option>
                      <option value="number">Number</option>
                      <option value="ivr">IVR</option>
                    </Select>
                  </FormControl>
                  <TextField
                    fullWidth
                    label="Bridge UUID / Number"
                    value={replyForm.content?.bridge_uuid || ''}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, bridge_uuid: e.target.value } }))}
                    placeholder="UUID or phone number"
                    size="small"
                    inputProps={{ style: { fontFamily: 'monospace' } }}
                  />
                </Box>
              </>
            )}

            {/* Hangup fields */}
            {replyForm.reply_type === 'hangup' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Text (TTS before hangup)"
                  value={replyForm.content?.text || ''}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, text: e.target.value } }))}
                  placeholder="Goodbye! Thank you for calling."
                  sx={{ mb: 2 }}
                />
                <FormControl fullWidth>
                  <InputLabel>Hangup Cause</InputLabel>
                  <Select
                    native
                    value={replyForm.content?.cause || 'NORMAL_CLEARING'}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, cause: e.target.value } }))}
                    label="Hangup Cause"
                    size="small"
                  >
                    <option value="NORMAL_CLEARING">Normal Clearing</option>
                    <option value="USER_BUSY">User Busy</option>
                    <option value="NO_ANSWER">No Answer</option>
                  </Select>
                </FormControl>
              </>
            )}

            {/* Ragents state — configuration only, never executable Admin code. */}
            {replyForm.reply_type === 'llm' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="System Prompt"
                  value={replyForm.content?.prompt || ''}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, prompt: e.target.value } }))}
                  placeholder="Help the caller diagnose the problem."
                  sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField fullWidth label="Provider UUID (optional)" value={replyForm.content?.provider_uuid || ''}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, provider_uuid: e.target.value } }))} />
                  <TextField fullWidth label="Model (optional)" value={replyForm.content?.model || ''}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, model: e.target.value } }))} />
                </Box>
                <TextField
                  fullWidth label="Allowed Tools" value={(replyForm.content?.tools || []).join(', ')}
                  onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, tools: e.target.value.split(',').map((tool) => tool.trim()).filter(Boolean) } }))}
                  helperText="Comma-separated explicit allow-list"
                  placeholder="transition_to_state, update_slots, transfer_to_human"
                  sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField fullWidth label="Next State" value={replyForm.content?.next || ''}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, next: e.target.value } }))} />
                  <TextField fullWidth label="Failure State" value={replyForm.content?.fails_to || 'catch_all'}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, fails_to: e.target.value } }))} />
                </Box>
                <FormControlLabel
                  control={<Switch checked={replyForm.content?.realtime?.allow_interrupt !== false}
                    onChange={(e) => setReplyForm(prev => ({ ...prev, content: { ...prev.content, realtime: { ...(prev.content?.realtime || {}), mode: 'stt_llm_tts', allow_interrupt: e.target.checked } } }))} />}
                  label="Allow caller barge-in"
                />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReplyDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!replyForm.state_name.trim()}
              onClick={async () => {
                const botId = selectedProject?.uuid;
                if (!botId) return;
                try {
                  if (editingReply) {
                    await updateReplyFn(botId, editingReply.uuid, replyForm);
                  } else {
                    await createReply(botId, replyForm);
                  }
                  setReplyDialog(false);
                } catch { /* error shown by hook */ }
              }}
            >
              {editingReply ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

      </Box>

      {/* AI Assistant — right-side chat while editing a bot (desktop only) */}
      <Box
        sx={{
          width: 400,
          flexShrink: 0,
          borderLeft: '1px solid',
          borderColor: 'divider',
          display: { xs: 'none', lg: 'flex' },
          minHeight: 0,
          overflow: 'hidden',
          bgcolor: 'var(--theme-bg-primary)',
        }}
      >
        <Suspense fallback={<Box sx={{ flex: 1 }} />}>
          <AIChat compact />
        </Suspense>
      </Box>
      </Box>
    );
  }

  // Dashboard View
  return (
    <Box className="bots-container">
      <Box className="bots-header">
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsCreateOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            New Bot
          </Button>
        )}
      </Box>

      <TextField
        placeholder="Search bots..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ mb: 3, maxWidth: 400 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
        }}
      />

      {filteredBots.length === 0 ? (
        <Paper className="bots-empty">
          <SmartToyIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {bots.length === 0 ? 'No bots yet' : 'No matching bots'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create a voice bot with replies, flows, and chat testing.
          </Typography>
          {bots.length === 0 && canWrite && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setIsCreateOpen(true)}>
              Create Bot
            </Button>
          )}
        </Paper>
      ) : (
        <Box className="bots-grid">
          {filteredBots.map((bot) => (
            <Paper key={bot.id} className="bot-card" onClick={() => setSelectedBot(bot)}>
              <Box className="bot-card-header">
                <SmartToyIcon sx={{ color: '#3b82f6' }} />
                <Typography variant="subtitle1" fontWeight={500} sx={{ flex: 1 }}>
                  {bot.name}
                </Typography>
                <IconButton size="small" onClick={(e) => handleMenuOpen(e, bot)}>
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Box>
              <Box className="bot-card-content">
                <Chip
                  label={bot.status}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: 11,
                    bgcolor: bot.status === 'active' ? '#dcfce7' : bot.status === 'paused' ? '#fef3c7' : '#f3f4f6',
                    color: bot.status === 'active' ? '#16a34a' : bot.status === 'paused' ? '#d97706' : '#6b7280',
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  Voice bot
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Updated {timeAgo(bot.updatedAt)}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Bot</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Bot Name"
            value={newBotName}
            onChange={(e) => setNewBotName(e.target.value)}
            placeholder="my-bot"
            sx={{ mt: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newBotName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
        {canWrite && (
          <MenuItem onClick={() => { deployBot(menuBot.id); handleMenuClose(); }}>
            <RocketLaunchIcon fontSize="small" sx={{ mr: 1 }} /> Deploy
          </MenuItem>
        )}
        {canWrite && (
          <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

export default Bots;
