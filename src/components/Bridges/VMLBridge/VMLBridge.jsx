import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Autocomplete,
  Menu,
  ListSubheader,
  Chip,
  Collapse,
  IconButton
} from '@mui/material';
import {
  Code as CodeIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Description as TemplateIcon,
  ContentPaste as SnippetIcon,
  ExpandMore as ExpandMoreIcon,
  Settings as SettingsIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  AutoAwesome as AIIcon,
  ContentCopy as CopyIcon,
  Send as SendIcon,
  Stop as StopIcon,
  SmartToy as SmartToyIcon,
  Person as PersonIcon,
  ChatBubbleOutline as ChatBubbleOutlineIcon,
  DeleteOutline as DeleteOutlineIcon,
  ErrorOutline as ErrorOutlineIcon
} from '@mui/icons-material';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { useVML } from './VMLBridge.js';
import { useVMLChat } from './useVMLChat.js';
import { CodeEditor } from './CodeEditor.jsx';
import { MetaPropertiesEditor } from '../shared/MetaPropertiesEditor.jsx';
import { TemplateDialog } from '../../Templates/Templates.jsx';
import { TEMPLATE_TYPES } from '../../Templates/Templates.js';
import { templatesApi } from '../../../services/api/templatesApi';
import { snippetCategories, scriptTemplates } from './luaFreeSwitchCompletions.js';
import { Z, menuProps } from '../../../utils/zIndex.js';
import { useConfirm } from '../../ui';
import { useIsUserSession } from '../../../hooks/useIsUserSession';

/**
 * VMLBridge Component — FreeSWitch Lua IDE
 * Editor-first layout: toolbar + big editor dominate, form fields are compact.
 *
 * Props:
 * - containerMode: 'dialog' (default) | 'panel'
 * - onDrillDown: optional callback (accepted but unused — VMLBridge is a leaf component)
 */
export const VMLBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  vml = null,
  mode = 'create',
  hideEnvironment = false,
  containerMode = 'dialog',
  zLayer = null,           // Optional z-index layer override (e.g. Z.L3 when nested)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDrillDown
}) => {
  const userSession = useIsUserSession();
  const confirm = useConfirm();
  const layer = zLayer || Z.L2;
  const { selectedEnvironments } = useCustomerEnvironment();

  const {
    vmlTypes,
    loadingTypes,
    vmlContent,
    setVMLContent,
    metaFields,
    setMetaFields,
    addMetaField,
    removeMetaField,
    updateMetaField,
    validateMetaFields,
    availableVariables,
    insertVariable,
    loading,
    error,
    clearError,
    saveVML,
    reset
  } = useVML();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    environment_uuid: '',
    enabled: true,
    notes: ''
  });

  const [formErrors, setFormErrors] = useState({});
  const [selectedVariable, setSelectedVariable] = useState(null);
  const editorRef = useRef(null);

  // Menu anchors
  const [templateAnchor, setTemplateAnchor] = useState(null);
  const [snippetAnchor, setSnippetAnchor] = useState(null);
  // Collapsible sections
  const [showMeta, setShowMeta] = useState(false);
  // Fullscreen editor
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  // AI Chat dialog
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const aiMessagesEndRef = useRef(null);

  // Template editing (via template_uuid in meta)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateData, setTemplateData] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  const templateUuid = metaFields?.find(f => f.key === 'template_uuid')?.value;

  const handleEditTemplate = async () => {
    if (!templateUuid) return;
    try {
      setTemplateLoading(true);
      const resp = await templatesApi.getTemplate(templateUuid);
      setTemplateData(resp.data || resp);
      setTemplateDialogOpen(true);
    } catch (err) {
      console.error('Failed to load template:', err);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleSaveTemplate = async (formData) => {
    await templatesApi.updateTemplate(templateData.uuid, formData);
    setTemplateDialogOpen(false);
    setTemplateData(null);
  };

  // Escape key exits fullscreen
  useEffect(() => {
    if (!editorFullscreen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setEditorFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [editorFullscreen]);

  const insertSnippetAtCursor = (snippetText) => {
    const editor = editorRef.current;
    if (editor) {
      editor.trigger('snippet', 'editor.action.insertSnippet', {
        snippet: snippetText
      });
      editor.focus();
    } else {
      setVMLContent((prev) => prev + snippetText);
    }
  };

  const handleApplyTemplate = async (template) => {
    if (vmlContent && vmlContent.trim()) {
      if (!(await confirm({ title: 'Replace editor content', confirmLabel: 'Replace',
                             message: 'Replace current editor content with this template?' }))) {
        setTemplateAnchor(null);
        return;
      }
    }
    setVMLContent(template.content);
    setTemplateAnchor(null);
    setTimeout(() => editorRef.current?.focus(), 100);
  };

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
  };

  // VML AI Chat hook
  const vmlChat = useVMLChat();

  // Insert last AI-generated code into the editor
  const handleAiInsertCode = async () => {
    const code = vmlChat.getLastAgentCode();
    if (!code) return;
    if (vmlContent && vmlContent.trim()) {
      if (!(await confirm({ title: 'Replace editor content', confirmLabel: 'Replace',
                             message: 'Replace current editor content with generated code?' }))) return;
    }
    setVMLContent(code);
    setAiDialogOpen(false);
    setTimeout(() => editorRef.current?.focus(), 100);
  };

  // Auto-scroll AI chat messages
  useEffect(() => {
    if (aiDialogOpen) {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [vmlChat.messages, aiDialogOpen]);

  // Initialize form data
  useEffect(() => {
    if (open) {
      const envUuid = environmentUuid || selectedEnvironments?.[0]?.uuid || '';

      if (mode === 'edit' && vml) {
        setFormData({
          name: vml.name || '',
          type: vml.type || '',
          environment_uuid: vml.environment_uuid || envUuid,
          enabled: vml.enabled !== undefined ? vml.enabled : true,
          notes: vml.notes || ''
        });
        if (vml.data) {
          setVMLContent(vml.data);
        }
        if (vml.meta && typeof vml.meta === 'object') {
          const metaArray = Object.entries(vml.meta).map(([key, value]) => ({ key, value: String(value) }));
          setMetaFields(metaArray);
          if (metaArray.length > 0) setShowMeta(true);
        }
      } else {
        setFormData(prev => ({ ...prev, environment_uuid: envUuid }));
      }
    }
  }, [open, environmentUuid, selectedEnvironments, mode, vml, setVMLContent]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      reset();
      setFormData({
        name: '',
        type: '',
        environment_uuid: '',
        enabled: true,
        notes: ''
      });
      setFormErrors({});
      setSelectedVariable(null);
      setShowMeta(false);
      setEditorFullscreen(false);
    }
  }, [open, reset]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleInsertVariable = () => {
    if (selectedVariable) {
      const insertText = selectedVariable.insert || selectedVariable;
      const editor = editorRef.current;
      if (editor) {
        const position = editor.getPosition();
        editor.executeEdits('variable-insert', [{
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: insertText,
        }]);
        editor.focus();
      } else {
        insertVariable(insertText);
      }
      setSelectedVariable(null);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name?.trim()) errors.name = 'Name is required';
    if (!formData.type) errors.type = 'VML type is required';
    if (!formData.environment_uuid) errors.environment_uuid = 'Application is required';
    if (!vmlContent?.trim()) errors.vmlContent = 'VML content is required';
    if (!validateMetaFields()) errors.meta = 'Duplicate meta keys are not allowed';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      let result;
      if (mode === 'edit' && vml) {
        const { updateVML } = await import('../../../services/api/vmlsApi.js');
        const meta = {};
        metaFields.forEach(field => {
          if (field.key.trim() && field.value.trim()) meta[field.key] = field.value;
        });
        result = await updateVML(vml.uuid, {
          ...formData,
          data: vmlContent,
          meta: Object.keys(meta).length > 0 ? meta : undefined
        });
      } else {
        result = await saveVML(formData);
      }
      onSave(result);
      onClose();
    } catch (err) {
      console.error('Submit error:', err);
    }
  };

  const isFormValid = formData.name && formData.type && formData.environment_uuid && vmlContent;

  // Editor fills most of the screen
  const editorHeight = containerMode === 'panel' ? 'calc(100vh - 340px)' : 'calc(100vh - 400px)';

  // ---------------------------------------------------------------------------
  // Form content — editor-first layout
  // ---------------------------------------------------------------------------
  const formContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: containerMode === 'panel' ? 0 : 1 }}>
      {/* Compact form row: Name | Type | Environment | Enabled */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          required
          error={!!formErrors.name}
          helperText={formErrors.name}
          placeholder="Script name"
          disabled={loading}
          size="small"
          sx={{ flex: 2, minWidth: 160 }}
        />

        <FormControl
          required
          error={!!formErrors.type}
          disabled={loading || loadingTypes}
          size="small"
          sx={{ flex: 1, minWidth: 120 }}
        >
          <InputLabel>Type</InputLabel>
          <Select
            value={formData.type}
            label="Type"
            onChange={(e) => handleChange('type', e.target.value)}
            MenuProps={menuProps(layer)}
          >
            {vmlTypes.map((type) => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* A portal user has one environment, their own: never a choice. */}
        {!hideEnvironment && !userSession && (
          <FormControl
            required
            error={!!formErrors.environment_uuid}
            disabled={loading}
            size="small"
            sx={{ flex: 1, minWidth: 140 }}
          >
            <InputLabel>Application</InputLabel>
            <Select
              value={formData.environment_uuid}
              label="Application"
              onChange={(e) => handleChange('environment_uuid', e.target.value)}
              MenuProps={menuProps(layer)}
            >
              {selectedEnvironments?.map(env => (
                <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <FormControlLabel
          control={
            <Switch
              checked={formData.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              disabled={loading}
              size="small"
            />
          }
          label="Enabled"
          sx={{ mr: 0 }}
        />
      </Box>

      {/* Editor toolbar: Templates | Snippets | ... | Variables */}
      <Box sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        flexWrap: 'wrap',
        py: 0.5,
        px: 1,
        bgcolor: '#1A1D23',
        borderRadius: '4px 4px 0 0',
        border: '1px solid',
        borderColor: 'divider',
        borderBottom: 'none'
      }}>
        {/* Templates dropdown */}
        <Button
          size="small"
          variant="text"
          startIcon={<TemplateIcon />}
          endIcon={<ExpandMoreIcon />}
          onClick={(e) => setTemplateAnchor(e.currentTarget)}
          disabled={loading}
          sx={{ color: '#9CDCFE', textTransform: 'none', fontSize: 12 }}
        >
          Templates
        </Button>
        <Menu
          anchorEl={templateAnchor}
          open={Boolean(templateAnchor)}
          onClose={() => setTemplateAnchor(null)}
          style={{ zIndex: layer.MENU }}
        >
          {scriptTemplates.map((t) => (
            <MenuItem key={t.label} onClick={() => handleApplyTemplate(t)}>
              <Box>
                <Typography variant="body2">{t.label}</Typography>
                <Typography variant="caption" color="text.secondary">{t.description}</Typography>
              </Box>
            </MenuItem>
          ))}
        </Menu>

        {/* Snippets dropdown */}
        <Button
          size="small"
          variant="text"
          startIcon={<SnippetIcon />}
          endIcon={<ExpandMoreIcon />}
          onClick={(e) => setSnippetAnchor(e.currentTarget)}
          disabled={loading}
          sx={{ color: '#9CDCFE', textTransform: 'none', fontSize: 12 }}
        >
          Snippets
        </Button>
        <Menu
          anchorEl={snippetAnchor}
          open={Boolean(snippetAnchor)}
          onClose={() => setSnippetAnchor(null)}
          style={{ zIndex: layer.MENU }}
          slotProps={{ paper: { sx: { maxHeight: 420, width: 280 } } }}
        >
          {snippetCategories.map((cat) => [
            <ListSubheader key={cat.category} sx={{ bgcolor: 'background.paper', lineHeight: '32px', fontWeight: 600 }}>
              {cat.category}
            </ListSubheader>,
            ...cat.snippets.map((s) => (
              <MenuItem
                key={`${cat.category}-${s.label}`}
                onClick={() => {
                  insertSnippetAtCursor(s.snippet);
                  setSnippetAnchor(null);
                }}
                sx={{ pl: 3, py: 0.5 }}
              >
                <Box>
                  <Typography variant="body2">{s.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.tip}</Typography>
                </Box>
              </MenuItem>
            ))
          ])}
        </Menu>

        {/* Lua label */}
        <Typography variant="caption" sx={{ color: '#6A9955', fontFamily: 'monospace', fontSize: 11 }}>
          Lua
        </Typography>

        <Box sx={{ flex: 1 }} />

        {/* AI Generate button */}
        <Button
          size="small"
          variant="text"
          startIcon={<AIIcon />}
          onClick={() => setAiDialogOpen(true)}
          disabled={loading}
          sx={{ color: '#C586C0', textTransform: 'none', fontSize: 12 }}
        >
          AI Generate
        </Button>

        {/* Fullscreen toggle */}
        <IconButton
          size="small"
          onClick={() => setEditorFullscreen(prev => !prev)}
          title={editorFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen editor'}
          sx={{ color: '#9CDCFE', p: 0.5 }}
        >
          {editorFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
        </IconButton>

        {/* Variable insertion */}
        <Autocomplete
          value={selectedVariable}
          onChange={(e, newValue) => setSelectedVariable(newValue)}
          options={availableVariables}
          getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.label)}
          isOptionEqualToValue={(opt, val) => opt.label === val.label}
          disabled={loading}
          size="small"
          slotProps={{ popper: { style: { zIndex: Z.L3.MENU } } }}
          sx={{
            minWidth: 200,
            '& .MuiInputBase-root': {
              bgcolor: '#22262E',
              color: '#D4D4D4',
              fontSize: 12
            },
            '& .MuiInputLabel-root': { color: '#8B8F96', fontSize: 12 },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3E4451' }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Variable"
              placeholder="getVariable(...)"
              size="small"
            />
          )}
          renderOption={(props, option) => (
            <li {...props}>
              <Chip label={option.label} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            </li>
          )}
        />
        <Button
          variant="text"
          size="small"
          onClick={handleInsertVariable}
          disabled={!selectedVariable || loading}
          startIcon={<AddIcon />}
          sx={{ color: '#9CDCFE', textTransform: 'none', fontSize: 12, minWidth: 'auto' }}
        >
          Insert
        </Button>
      </Box>

      {/* Monaco Editor — takes all available height */}
      <Box sx={{ mt: '-1px' }}>
        <CodeEditor
          value={vmlContent}
          onChange={setVMLContent}
          onEditorMount={handleEditorMount}
          language="lua"
          height={editorHeight}
          theme="freeswitch-dark"
          readOnly={loading}
          fullscreen={editorFullscreen}
        />
      </Box>

      {formErrors.vmlContent && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {formErrors.vmlContent}
        </Alert>
      )}

      {/* Collapsible Meta Properties + Notes */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton
          size="small"
          onClick={() => setShowMeta(!showMeta)}
          sx={{ transform: showMeta ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ cursor: 'pointer' }} onClick={() => setShowMeta(!showMeta)}>
          {showMeta ? 'Hide' : 'Show'} Notes & Meta Properties
        </Typography>
        <SettingsIcon fontSize="small" sx={{ color: 'text.disabled' }} />
      </Box>

      <Collapse in={showMeta}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 1 }}>
          <TextField
            label="Notes"
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional notes or description"
            disabled={loading}
            size="small"
          />

          <MetaPropertiesEditor
            metaFields={metaFields}
            onAdd={addMetaField}
            onRemove={removeMetaField}
            onUpdate={updateMetaField}
            validateDuplicates={true}
            title="Meta Properties"
            addButtonText="Add Property"
          />
          {formErrors.meta && (
            <Alert severity="error">{formErrors.meta}</Alert>
          )}

          {/* Edit linked template when template_uuid exists in meta */}
          {templateUuid && (
            <Button
              startIcon={templateLoading ? <CircularProgress size={16} /> : <TemplateIcon />}
              onClick={handleEditTemplate}
              disabled={templateLoading}
              size="small"
              variant="outlined"
              sx={{ alignSelf: 'flex-start' }}
            >
              Edit Template
            </Button>
          )}
        </Box>
      </Collapse>

      {/* Template Edit Dialog */}
      <TemplateDialog
        open={templateDialogOpen}
        onClose={() => { setTemplateDialogOpen(false); setTemplateData(null); }}
        onSave={handleSaveTemplate}
        template={templateData}
        loading={false}
        templateTypes={TEMPLATE_TYPES}
        zIndex={Z.L3.DIALOG}
      />

      {error && (
        <Alert severity="error" onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* AI Chat Dialog — full chat interface with sessions */}
      <Dialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        maxWidth="md"
        fullWidth
        sx={{ '& .MuiDialog-paper': { zIndex: Z.L3.DIALOG, height: '85vh', maxHeight: '85vh' } }}
        style={{ zIndex: Z.L3.DIALOG }}
      >
        {/* Header */}
        <DialogTitle sx={{ py: 1, px: 2, bgcolor: '#111113', borderBottom: '1px solid #27272a' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AIIcon sx={{ color: '#C586C0' }} />
              <Typography variant="h6" sx={{ color: '#fafafa', fontSize: '1rem' }}>
                VML AI Assistant
              </Typography>
              {vmlChat.isStreaming && <CircularProgress size={16} sx={{ color: '#C586C0' }} />}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {vmlChat.getLastAgentCode() && !vmlChat.isStreaming && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<CodeIcon />}
                  onClick={handleAiInsertCode}
                  sx={{ textTransform: 'none', fontSize: 12 }}
                >
                  Insert Code
                </Button>
              )}
              <Button
                size="small"
                onClick={() => vmlChat.clearChat()}
                disabled={vmlChat.messages.length === 0}
                sx={{ color: '#a1a1aa', textTransform: 'none', fontSize: 12 }}
              >
                New Chat
              </Button>
              <IconButton size="small" onClick={() => setAiDialogOpen(false)} sx={{ color: '#a1a1aa' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ display: 'flex', p: 0, overflow: 'hidden', bgcolor: '#18181b' }}>
          {/* Sessions sidebar */}
          <Box sx={{
            width: 200,
            borderRight: '1px solid #27272a',
            bgcolor: '#111113',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            <Typography sx={{ px: 1.5, py: 1, color: '#a1a1aa', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
              Sessions
            </Typography>
            <Box sx={{ flex: 1, overflow: 'auto', px: 0.5 }}>
              {vmlChat.isLoadingSessions ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                  <CircularProgress size={20} sx={{ color: '#C586C0' }} />
                </Box>
              ) : vmlChat.sessions.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ChatBubbleOutlineIcon sx={{ fontSize: 28, color: '#27272a', mb: 0.5 }} />
                  <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>No sessions yet</Typography>
                </Box>
              ) : (
                vmlChat.sessions.map((session) => (
                  <Box
                    key={session.session_id}
                    onClick={() => vmlChat.loadSession(session.session_id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 1,
                      py: 0.75,
                      borderRadius: 1,
                      cursor: 'pointer',
                      bgcolor: vmlChat.sessionId === session.session_id ? '#27272a' : 'transparent',
                      '&:hover': { bgcolor: '#1f1f23' },
                      mb: 0.25
                    }}
                  >
                    <Typography sx={{
                      fontSize: '0.72rem',
                      color: vmlChat.sessionId === session.session_id ? '#fafafa' : '#a1a1aa',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1
                    }}>
                      {session.session_name || 'Chat'}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); vmlChat.deleteSession(session.session_id); }}
                      sx={{ opacity: 0, '.MuiBox-root:hover &': { opacity: 1 }, color: 'var(--mui-palette-text-secondary)', p: 0.25 }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))
              )}
            </Box>
          </Box>

          {/* Chat area */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Messages */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {vmlChat.messages.length === 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <AIIcon sx={{ fontSize: 48, color: '#27272a', mb: 2 }} />
                  <Typography sx={{ color: '#fafafa', fontWeight: 600, mb: 0.5 }}>
                    VML AI Assistant
                  </Typography>
                  <Typography sx={{ color: 'var(--mui-palette-text-secondary)', fontSize: '0.85rem', textAlign: 'center', maxWidth: 400 }}>
                    Describe the Lua script you need. You can iterate — ask follow-up questions to refine the code.
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2, justifyContent: 'center', maxWidth: 500 }}>
                    {[
                      'Create an IVR with language selection',
                      'Route calls to queue based on time of day',
                      'Play announcement then transfer',
                      'HTTP lookup before routing'
                    ].map((prompt) => (
                      <Chip
                        key={prompt}
                        label={prompt}
                        onClick={() => vmlChat.sendMessage(prompt)}
                        sx={{
                          bgcolor: '#27272a', color: '#a1a1aa', fontSize: '0.78rem', cursor: 'pointer',
                          '&:hover': { bgcolor: '#C586C0', color: '#fff' }
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              ) : (
                <Box sx={{ maxWidth: 700, mx: 'auto' }}>
                  {vmlChat.messages.map((msg) => (
                    <Box key={msg.id} sx={{ display: 'flex', gap: 1.5, mb: 2.5, alignItems: 'flex-start' }}>
                      <Box sx={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: msg.role === 'user' ? '#3f3f46' : '#C586C0'
                      }}>
                        {msg.role === 'user'
                          ? <PersonIcon sx={{ fontSize: 16, color: '#fafafa' }} />
                          : <SmartToyIcon sx={{ fontSize: 16, color: '#fff' }} />
                        }
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {msg.role === 'user' ? (
                          <Typography sx={{ color: '#fafafa', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                            {msg.content}
                          </Typography>
                        ) : msg.streamingError ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#ef4444' }}>
                            <ErrorOutlineIcon sx={{ fontSize: 16 }} />
                            <Typography sx={{ fontSize: '0.85rem' }}>{msg.content}</Typography>
                          </Box>
                        ) : msg.content ? (
                          <Box sx={{ position: 'relative' }}>
                            <Box sx={{
                              bgcolor: '#1E1E1E',
                              borderRadius: 1,
                              border: '1px solid #3E4451',
                              overflow: 'hidden'
                            }}>
                              <Box sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                px: 1.5, py: 0.5, bgcolor: '#252526', borderBottom: '1px solid #3E4451'
                              }}>
                                <Typography variant="caption" sx={{ color: '#6A9955', fontFamily: 'monospace' }}>Lua</Typography>
                                <IconButton
                                  size="small"
                                  onClick={() => navigator.clipboard.writeText(msg.content)}
                                  sx={{ color: '#9CDCFE', p: 0.25 }}
                                  title="Copy"
                                >
                                  <CopyIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Box>
                              <Box sx={{
                                p: 1.5, overflow: 'auto', maxHeight: 400,
                                fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
                                fontSize: 12, lineHeight: 1.5, color: '#D4D4D4',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                              }}>
                                {msg.content}
                              </Box>
                            </Box>
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex', gap: 0.5, py: 1 }}>
                            {[0, 1, 2].map(i => (
                              <Box key={i} sx={{
                                width: 6, height: 6, borderRadius: '50%', bgcolor: '#C586C0',
                                animation: 'pulse 1.4s infinite ease-in-out',
                                animationDelay: `${i * 0.16}s`,
                                '@keyframes pulse': {
                                  '0%, 80%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
                                  '40%': { opacity: 1, transform: 'scale(1)' }
                                }
                              }} />
                            ))}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  ))}
                  <div ref={aiMessagesEndRef} />
                </Box>
              )}
            </Box>

            {/* Error */}
            {vmlChat.error && (
              <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => {}}>
                {vmlChat.error}
              </Alert>
            )}

            {/* Input area */}
            <Box sx={{ p: 1.5, borderTop: '1px solid #27272a', bgcolor: '#111113' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, maxWidth: 700, mx: 'auto' }}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={3}
                  placeholder="Describe the Lua script you need..."
                  value={vmlChat.inputValue}
                  onChange={(e) => vmlChat.setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      vmlChat.sendMessage(vmlChat.inputValue);
                    }
                  }}
                  disabled={vmlChat.isStreaming}
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px', bgcolor: '#27272a', color: '#fafafa',
                      '& fieldset': { borderColor: 'transparent' },
                      '&:hover fieldset': { borderColor: '#3f3f46' },
                      '&.Mui-focused fieldset': { borderColor: '#C586C0' }
                    },
                    '& .MuiInputBase-input': { '&::placeholder': { color: 'var(--mui-palette-text-secondary)', opacity: 1 } }
                  }}
                />
                {vmlChat.isStreaming ? (
                  <IconButton onClick={vmlChat.cancelRequest} sx={{ bgcolor: '#ef4444', color: '#fff', '&:hover': { bgcolor: '#dc2626' } }}>
                    <StopIcon />
                  </IconButton>
                ) : (
                  <IconButton
                    onClick={() => vmlChat.sendMessage(vmlChat.inputValue)}
                    disabled={!vmlChat.inputValue.trim()}
                    sx={{
                      bgcolor: 'var(--mui-palette-surface-muted)', color: '#18181b',
                      '&:hover': { bgcolor: '#e5e5e5' },
                      '&.Mui-disabled': { bgcolor: '#27272a', color: 'var(--mui-palette-text-secondary)' }
                    }}
                  >
                    <SendIcon />
                  </IconButton>
                )}
              </Box>
              <Typography sx={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                Enter to send, Shift+Enter for new line
              </Typography>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );

  // Action buttons
  const actionButtons = (
    <>
      <Button onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={!isFormValid || loading}
        startIcon={loading ? <CircularProgress size={20} /> : <CodeIcon />}
      >
        {loading
          ? (mode === 'edit' ? 'Updating...' : 'Creating...')
          : (mode === 'edit' ? 'Update VML' : 'Create VML')}
      </Button>
    </>
  );

  // ---------------------------------------------------------------------------
  // Panel mode
  // ---------------------------------------------------------------------------
  if (containerMode === 'panel') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CodeIcon />
          <Typography variant="h6">
            {mode === 'edit' ? 'Edit VML Script' : 'Create VML Script'}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {formContent}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 1 }}>
          {actionButtons}
        </Box>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // Dialog mode — fullScreen for IDE feel
  // ---------------------------------------------------------------------------
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      sx={{
        zIndex: layer.DIALOG,
        '& .MuiDialog-paper': {
          maxWidth: '95vw',
          width: '95vw',
          height: '92vh',
          maxHeight: '92vh'
        }
      }}
    >
      <DialogTitle sx={{ py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CodeIcon />
            <Typography variant="h6">{mode === 'edit' ? 'Edit VML Script' : 'Create VML Script'}</Typography>
          </Box>
          <Button onClick={onClose} size="small" sx={{ minWidth: 'auto' }}>
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ py: 1 }}>
        {formContent}
      </DialogContent>

      <DialogActions sx={{ py: 1 }}>
        {actionButtons}
      </DialogActions>
    </Dialog>
  );
};

export default VMLBridge;
