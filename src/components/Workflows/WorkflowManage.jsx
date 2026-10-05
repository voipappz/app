import { useState, useEffect, useCallback, useRef } from 'react';
import DesktopRecommended from '../common/DesktopRecommended.jsx';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Tooltip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  Tabs,
  Tab,
  Collapse,
  Autocomplete,
  Menu,
} from '@mui/material';
import {
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Code as CodeIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  AccountTree as FlowIcon,
  FiberManualRecord as DotIcon,
  FileDownload as LoadTemplateIcon,
  Input as InputIcon,
} from '@mui/icons-material';
import Editor from '@monaco-editor/react';

import CogNode, { StartNode, EndNode, COG_TYPE_CONFIG } from './nodes/CogNode';
import { workflowsApi } from '../../services/api/workflowsApi';
import WorkflowRunsPanel from './WorkflowRunsPanel';
import { servicesApi } from '../../services/api/servicesApi';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotification } from '../../context/NotificationContext';
import { ConfirmDialog } from '../ui';

/* ═══════════════════════════════════════════════════════════════════
   Node / Edge types for ReactFlow
   ═══════════════════════════════════════════════════════════════════ */
const nodeTypes = { start: StartNode, roast_cog: CogNode, end: EndNode };

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#90a4ae' },
  style: { stroke: '#90a4ae', strokeWidth: 1.5 },
};

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */
const nextId = (() => { let n = 1; return () => `node-${Date.now()}-${n++}`; })();
const nextEdgeId = (() => { let n = 1; return () => `edge-${Date.now()}-${n++}`; })();

const inferLanguage = (cogType) => {
  const cfg = COG_TYPE_CONFIG[cogType];
  return cfg?.lang || 'ruby';
};

const parseFlowData = (fd) => {
  if (!fd) return null;
  if (typeof fd === 'string') {
    try { return JSON.parse(fd); } catch { return null; }
  }
  return fd;
};

/* ═══════════════════════════════════════════════════════════════════
   Flow Templates — production-grade starting points
   ═══════════════════════════════════════════════════════════════════ */
const FLOW_TEMPLATES = [
  {
    key: 'blank',
    name: 'Blank Flow',
    desc: 'Empty canvas with start and end nodes',
    nodes: [
      { id: 'start-1', type: 'start', data: {}, position: { x: 250, y: 0 } },
      { id: 'end-1', type: 'end', data: {}, position: { x: 250, y: 300 } },
    ],
    edges: [],
  },
  {
    key: 'event-webhook',
    name: 'Event → Webhook',
    desc: 'Accept event, build JSON payload, POST to URL',
    nodes: [
      { id: 'start-1', type: 'start', data: {}, position: { x: 250, y: 0 } },
      {
        id: 'cog-1', type: 'roast_cog', position: { x: 160, y: 120 },
        data: {
          cog_type: 'ruby', name: 'send_webhook',
          code: `require 'net/http'
require 'json'

# Build payload from event data
payload = {
  event:     event_name,
  caller_id: event_data[:caller_id_number],
  extension: event_data[:extension_username],
  direction: event_data[:direction],
  did:       event_data[:did_number],
  timestamp: Time.now.iso8601
}

# POST to your webhook URL
url = URI(config['url'] || 'https://httpbin.org/post')
http = Net::HTTP.new(url.host, url.port)
http.use_ssl = url.scheme == 'https'

req = Net::HTTP::Post.new(url.path)
req['Content-Type'] = 'application/json'
req.body = payload.to_json

res = http.request(req)
{ status: res.code.to_i, body: res.body }`,
          config: { url: 'https://httpbin.org/post' },
        },
      },
      { id: 'end-1', type: 'end', data: {}, position: { x: 250, y: 320 } },
    ],
    edges: [
      { id: 'e1', source: 'start-1', target: 'cog-1', sourceHandle: 'default' },
      { id: 'e2', source: 'cog-1', target: 'end-1', sourceHandle: 'done' },
    ],
  },
  {
    key: 'curl-webhook',
    name: 'Event → cURL Webhook',
    desc: 'Send event data via curl shell command',
    nodes: [
      { id: 'start-1', type: 'start', data: {}, position: { x: 250, y: 0 } },
      {
        id: 'cog-1', type: 'roast_cog', position: { x: 160, y: 120 },
        data: {
          cog_type: 'cmd', name: 'curl_webhook',
          code: `curl -s -X POST https://httpbin.org/post \\
  -H 'Content-Type: application/json' \\
  -d '{"event":"{{event_name}}","caller":"{{caller_id_number}}","direction":"{{direction}}","did":"{{did_number}}"}'`,
          config: {},
        },
      },
      { id: 'end-1', type: 'end', data: {}, position: { x: 250, y: 320 } },
    ],
    edges: [
      { id: 'e1', source: 'start-1', target: 'cog-1', sourceHandle: 'default' },
      { id: 'e2', source: 'cog-1', target: 'end-1', sourceHandle: 'done' },
    ],
  },
  {
    key: 'ai-classify-webhook',
    name: 'Event → AI Classify → Webhook',
    desc: 'LLM classifies the event, then Ruby sends result to CRM',
    nodes: [
      { id: 'start-1', type: 'start', data: {}, position: { x: 250, y: 0 } },
      {
        id: 'cog-classify', type: 'roast_cog', position: { x: 160, y: 120 },
        data: {
          cog_type: 'chat', name: 'classify_call',
          code: `Classify this phone call and return a JSON object with "category" and "priority" fields.

Call details:
- Event: {{event_name}}
- Caller: {{caller_id_number}}
- Direction: {{direction}}
- Extension: {{extension_username}}
- DID: {{did_number}}

Categories: sales, support, billing, spam, other
Priority: low, medium, high, urgent

Return ONLY valid JSON, no explanation.`,
          config: { model: 'claude-sonnet-4-5-20250514' },
        },
      },
      {
        id: 'cog-webhook', type: 'roast_cog', position: { x: 160, y: 350 },
        data: {
          cog_type: 'ruby', name: 'send_to_crm',
          code: `require 'net/http'
require 'json'

# prev_output has the AI classification
classification = begin
  JSON.parse(prev_output)
rescue
  { "category" => "unknown", "priority" => "low" }
end

payload = {
  event:          event_name,
  caller_id:      event_data[:caller_id_number],
  classification: classification,
  timestamp:      Time.now.iso8601
}

url = URI(config['crm_url'] || 'https://httpbin.org/post')
http = Net::HTTP.new(url.host, url.port)
http.use_ssl = url.scheme == 'https'

req = Net::HTTP::Post.new(url.path)
req['Content-Type'] = 'application/json'
req.body = payload.to_json

res = http.request(req)
{ status: res.code.to_i, classification: classification }`,
          config: { crm_url: 'https://httpbin.org/post' },
        },
      },
      { id: 'end-1', type: 'end', data: {}, position: { x: 250, y: 560 } },
    ],
    edges: [
      { id: 'e1', source: 'start-1', target: 'cog-classify', sourceHandle: 'default' },
      { id: 'e2', source: 'cog-classify', target: 'cog-webhook', sourceHandle: 'done' },
      { id: 'e3', source: 'cog-webhook', target: 'end-1', sourceHandle: 'done' },
    ],
  },
  {
    key: 'ruby-process-chain',
    name: 'Event → Process → Transform → Send',
    desc: 'Multi-step Ruby pipeline: validate, transform, then send',
    nodes: [
      { id: 'start-1', type: 'start', data: {}, position: { x: 250, y: 0 } },
      {
        id: 'cog-validate', type: 'roast_cog', position: { x: 160, y: 120 },
        data: {
          cog_type: 'ruby', name: 'validate_event',
          code: `# Validate the incoming event
caller = event_data[:caller_id_number] || ''
raise "Missing caller ID" if caller.empty?
raise "Invalid caller format" unless caller.match?(/^\\+?\\d{7,15}$/)

# Pass validated data downstream
{
  caller_id:  caller,
  extension:  event_data[:extension_username],
  direction:  event_data[:direction],
  event:      event_name,
  valid:      true
}`,
          config: {},
        },
      },
      {
        id: 'cog-transform', type: 'roast_cog', position: { x: 160, y: 340 },
        data: {
          cog_type: 'ruby', name: 'enrich_data',
          code: `# Enrich with additional context
data = prev_output || {}

# Add computed fields
data[:processed_at] = Time.now.iso8601
data[:caller_region] = case data[:caller_id]
  when /^\\+1/    then 'US/CA'
  when /^\\+44/   then 'UK'
  when /^\\+972/  then 'IL'
  else 'OTHER'
end
data[:priority] = data[:direction] == 'inbound' ? 'high' : 'normal'

data`,
          config: {},
        },
      },
      {
        id: 'cog-send', type: 'roast_cog', position: { x: 160, y: 560 },
        data: {
          cog_type: 'ruby', name: 'post_to_api',
          code: `require 'net/http'
require 'json'

url = URI(config['api_url'] || 'https://httpbin.org/post')
http = Net::HTTP.new(url.host, url.port)
http.use_ssl = url.scheme == 'https'

req = Net::HTTP::Post.new(url.path)
req['Content-Type'] = 'application/json'
req['Authorization'] = "Bearer #{config['api_key']}" if config['api_key']
req.body = (prev_output || {}).to_json

res = http.request(req)
{ status: res.code.to_i, body: res.body }`,
          config: { api_url: 'https://httpbin.org/post', api_key: '' },
        },
      },
      { id: 'end-1', type: 'end', data: {}, position: { x: 250, y: 760 } },
    ],
    edges: [
      { id: 'e1', source: 'start-1', target: 'cog-validate', sourceHandle: 'default' },
      { id: 'e2', source: 'cog-validate', target: 'cog-transform', sourceHandle: 'done' },
      { id: 'e3', source: 'cog-transform', target: 'cog-send', sourceHandle: 'done' },
      { id: 'e4', source: 'cog-send', target: 'end-1', sourceHandle: 'done' },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════
   View Code Dialog
   ═══════════════════════════════════════════════════════════════════ */
const ViewCodeDialog = ({ open, onClose, workflow }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState('ruby');

  useEffect(() => {
    if (!open || !workflow?.uuid) return;
    setLoading(true);
    workflowsApi.getFlowCode(workflow.uuid, format)
      .then((res) => setCode(typeof res === 'string' ? res : JSON.stringify(res, null, 2)))
      .catch(() => setCode('# Failed to load code'))
      .finally(() => setLoading(false));
  }, [open, workflow?.uuid, format]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CodeIcon />
        <span style={{ flex: 1 }}>Generated Code — {workflow?.name}</span>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={format} onChange={(e) => setFormat(e.target.value)}>
            <MenuItem value="ruby">Ruby</MenuItem>
            <MenuItem value="yaml">YAML</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
          </Select>
        </FormControl>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
        ) : (
          <Box sx={{ mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Editor
              height="400px"
              language={format === 'json' ? 'json' : format === 'yaml' ? 'yaml' : 'ruby'}
              value={code}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Test / Simulator Panel
   ═══════════════════════════════════════════════════════════════════ */
const TestPanel = ({ workflow }) => {
  const [eventName, setEventName] = useState('user.answer');
  const [callerId, setCallerId] = useState('+15551234567');
  const [extension, setExtension] = useState('1001');
  const [direction, setDirection] = useState('inbound');
  const [didNumber, setDidNumber] = useState('+19175550000');
  const [queueName, setQueueName] = useState('support');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const runTest = async () => {
    if (!workflow?.uuid) return;
    setRunning(true);
    setResult(null);
    const t0 = Date.now();
    try {
      const res = await workflowsApi.testWorkflow(workflow.uuid, {
        event_name: eventName,
        caller_id_number: callerId,
        extension_username: extension,
        direction,
        did_number: didNumber,
        queue_name: queueName,
      });
      setElapsed(Date.now() - t0);
      setResult(res);
    } catch (err) {
      setElapsed(Date.now() - t0);
      setResult({ success: false, error: err?.message || 'Test failed' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Event fields */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Event</InputLabel>
          <Select value={eventName} label="Event" onChange={(e) => setEventName(e.target.value)}>
            <MenuItem value="user.answer">user.answer</MenuItem>
            <MenuItem value="user.hangup">user.hangup</MenuItem>
            <MenuItem value="user.ringing">user.ringing</MenuItem>
            <MenuItem value="queue.start">queue.start</MenuItem>
            <MenuItem value="queue.end">queue.end</MenuItem>
          </Select>
        </FormControl>
        <TextField size="small" label="Caller ID" value={callerId} onChange={(e) => setCallerId(e.target.value)} sx={{ flex: 1, minWidth: 120 }} />
        <TextField size="small" label="Device" value={extension} onChange={(e) => setExtension(e.target.value)} sx={{ width: 90 }} />
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Direction</InputLabel>
          <Select value={direction} label="Direction" onChange={(e) => setDirection(e.target.value)}>
            <MenuItem value="inbound">inbound</MenuItem>
            <MenuItem value="outbound">outbound</MenuItem>
          </Select>
        </FormControl>
        <TextField size="small" label="Route" value={didNumber} onChange={(e) => setDidNumber(e.target.value)} sx={{ flex: 1, minWidth: 120 }} />
        <TextField size="small" label="Queue" value={queueName} onChange={(e) => setQueueName(e.target.value)} sx={{ width: 100 }} />
        <Button variant="contained" color="success" size="small" onClick={runTest}
          disabled={!workflow?.uuid || running} sx={{ minWidth: 80 }}
          startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}>
          {running ? 'Running' : 'Run Test'}
        </Button>
      </Box>

      {/* Results */}
      {result && (
        <Paper variant="outlined" sx={{
          mt: 1,
          borderColor: result.success ? 'success.main' : 'error.main',
          overflow: 'hidden',
        }}>
          {/* Result header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
            bgcolor: result.success ? 'rgba(46, 125, 50, 0.08)' : 'rgba(211, 47, 47, 0.08)',
            borderBottom: '1px solid', borderColor: 'divider',
          }}>
            {result.success
              ? <CheckCircleIcon color="success" sx={{ fontSize: 18 }} />
              : <ErrorIcon color="error" sx={{ fontSize: 18 }} />
            }
            <Typography variant="subtitle2" fontWeight={600}
              color={result.success ? 'success.main' : 'error.main'}>
              {result.success ? 'Flow Executed Successfully' : 'Flow Execution Failed'}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Chip label={`${elapsed}ms`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
            <Chip label={result.event_name || eventName} size="small" color="info" sx={{ fontSize: '0.7rem', height: 22 }} />
          </Box>

          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Error message */}
            {result.error && (
              <Alert severity="error" sx={{ py: 0 }}>{result.error}</Alert>
            )}

            {/* Cog output */}
            {result.cog_output !== undefined && result.cog_output !== null && (
              <Box>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Cog Output
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#1e1e1e', maxHeight: 200, overflow: 'auto' }}>
                  <pre style={{
                    margin: 0, fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    color: '#d4d4d4', fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  }}>
                    {typeof result.cog_output === 'string' ? result.cog_output : JSON.stringify(result.cog_output, null, 2)}
                  </pre>
                </Paper>
              </Box>
            )}

            {/* Webhook result */}
            {result.webhook_result && (
              <Box>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Webhook Result
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  {result.webhook_result.url && (
                    <Chip label={result.webhook_result.url} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                  )}
                  {result.webhook_result.status && (
                    <Chip
                      label={`HTTP ${result.webhook_result.status}`}
                      size="small"
                      color={String(result.webhook_result.status).startsWith('2') ? 'success' : 'error'}
                      sx={{ fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
                {result.webhook_result.body && (
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#1e1e1e', maxHeight: 150, overflow: 'auto' }}>
                    <pre style={{
                      margin: 0, fontSize: '11px', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      color: '#d4d4d4', fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    }}>
                      {typeof result.webhook_result.body === 'string' ? result.webhook_result.body : JSON.stringify(result.webhook_result.body, null, 2)}
                    </pre>
                  </Paper>
                )}
              </Box>
            )}

            {/* Cog result details */}
            {result.cog_result && !result.cog_output && (
              <Box>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Execution Result
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#1e1e1e', maxHeight: 150, overflow: 'auto' }}>
                  <pre style={{
                    margin: 0, fontSize: '11px', lineHeight: 1.4, whiteSpace: 'pre-wrap',
                    color: '#d4d4d4', fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  }}>
                    {JSON.stringify(result.cog_result, null, 2)}
                  </pre>
                </Paper>
              </Box>
            )}

            {/* Event data sent */}
            {result.event_data && (
              <Box>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Event Data Sent
                </Typography>
                <Paper variant="outlined" sx={{ p: 1, bgcolor: 'var(--mui-palette-surface-muted)', maxHeight: 100, overflow: 'auto' }}>
                  <pre style={{ margin: 0, fontSize: '10px', lineHeight: 1.3, whiteSpace: 'pre-wrap', color: '#555' }}>
                    {JSON.stringify(result.event_data, null, 2)}
                  </pre>
                </Paper>
              </Box>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Editor Panel (right side) — different views per node type
   ═══════════════════════════════════════════════════════════════════ */
const EditorPanel = ({ node, onUpdate, onDelete, onClose }) => {
  const [name, setName] = useState('');
  const [selectedCogType, setSelectedCogType] = useState('ruby');
  const [code, setCode] = useState('');
  const [config, setConfig] = useState({});

  // Reset when node changes
  useEffect(() => {
    if (!node) return;
    setName(node.data?.name || '');
    setSelectedCogType(node.data?.cog_type || 'ruby');
    setCode(node.data?.code || '');
    setConfig(node.data?.config || {});
  }, [node?.id]);

  const handleApply = () => {
    onUpdate(node.id, {
      ...node.data,
      name,
      cog_type: selectedCogType,
      code,
      config,
    });
  };

  if (!node) return null;

  // Start / End nodes
  if (node.type === 'start' || node.type === 'end') {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Box sx={{ textAlign: 'center', py: 3 }}>
          {node.type === 'start'
            ? <PlayArrowIcon sx={{ fontSize: 40, color: '#43a047', mb: 1 }} />
            : <CloseIcon sx={{ fontSize: 40, color: '#e53935', mb: 1 }} />
          }
          <Typography variant="subtitle1" fontWeight={600}>
            {node.type === 'start' ? 'Start Node' : 'End Node'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {node.type === 'start'
              ? 'The flow begins here. Connect to your first cog node.'
              : 'The flow ends here. Connect from your last cog\'s "done" output.'
            }
          </Typography>
        </Box>
      </Box>
    );
  }

  const typeConfig = COG_TYPE_CONFIG[selectedCogType] || COG_TYPE_CONFIG.ruby;
  const TypeIcon = typeConfig.icon;

  // Cog type descriptions for help text
  const cogHelp = {
    ruby: 'Ruby code with access to: event_data, event_name, config, prev_output, customer_uuid',
    cmd: 'Shell command with {{template}} interpolation: {{caller_id_number}}, {{event_name}}, {{direction}}, etc.',
    chat: 'LLM prompt with {{template}} interpolation. Output goes to prev_output for next node.',
    agent: 'AI agent prompt with {{template}} interpolation. Uses system instructions for coding tasks.',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
        borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: `${typeConfig.color}08`,
      }}>
        <TypeIcon sx={{ fontSize: 18, color: typeConfig.color }} />
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          Edit {typeConfig.label} Cog
        </Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Cog Type selector */}
        <FormControl size="small" fullWidth>
          <InputLabel>Cog Type</InputLabel>
          <Select value={selectedCogType} label="Cog Type" onChange={(e) => setSelectedCogType(e.target.value)}>
            {Object.entries(COG_TYPE_CONFIG).map(([key, cfg]) => {
              const CIcon = cfg.icon;
              return (
                <MenuItem key={key} value={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CIcon sx={{ fontSize: 16, color: cfg.color }} />
                    <span>{cfg.label}</span>
                    <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>— {cfg.desc}</Typography>
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        {/* Name */}
        <TextField size="small" label="Node Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth
          placeholder="e.g. send_webhook, validate_input" />

        {/* Help text */}
        <Alert severity="info" sx={{ py: 0, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
          {cogHelp[selectedCogType]}
        </Alert>

        {/* Monaco Editor */}
        <Box sx={{ flex: 1, minHeight: 200 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {selectedCogType === 'ruby' ? 'Ruby Code' : selectedCogType === 'cmd' ? 'Shell Command' : 'Prompt'}
            </Typography>
            <Chip label={inferLanguage(selectedCogType)} size="small" variant="outlined"
              sx={{ fontSize: '0.6rem', height: 18 }} />
          </Box>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Editor
              height="300px"
              language={inferLanguage(selectedCogType)}
              value={code}
              onChange={(v) => setCode(v || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
              }}
            />
          </Box>
        </Box>

        {/* Config key-value pairs */}
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
            Config (referenced in code as config['key'])
          </Typography>
          {Object.entries(config).map(([k, v], idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 0.5, mb: 0.5, alignItems: 'center' }}>
              <TextField size="small" placeholder="key" value={k}
                onChange={(e) => {
                  const entries = Object.entries(config);
                  entries[idx] = [e.target.value, v];
                  setConfig(Object.fromEntries(entries.filter(([kk]) => kk)));
                }}
                sx={{ flex: 1 }}
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
              />
              <Typography variant="caption" color="text.disabled">=</Typography>
              <TextField size="small" placeholder="value" value={v}
                onChange={(e) => setConfig({ ...config, [k]: e.target.value })}
                sx={{ flex: 2 }}
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
              />
              <IconButton size="small" onClick={() => {
                const next = { ...config };
                delete next[k];
                setConfig(next);
              }}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setConfig({ ...config, '': '' })}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
            Add config key
          </Button>
        </Box>
      </Box>

      {/* Footer */}
      <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, justifyContent: 'space-between' }}>
        <Button size="small" color="error" variant="outlined" startIcon={<DeleteIcon />}
          onClick={() => onDelete(node.id)}>
          Delete Node
        </Button>
        <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleApply}>
          Apply Changes
        </Button>
      </Box>
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Cog Palette (sidebar bottom)
   ═══════════════════════════════════════════════════════════════════ */
const COG_PALETTE = Object.entries(COG_TYPE_CONFIG).map(([key, cfg]) => ({ key, ...cfg }));

/* ═══════════════════════════════════════════════════════════════════
   Main Canvas Component (inside ReactFlowProvider)
   ═══════════════════════════════════════════════════════════════════ */
const WorkflowCanvas = () => {
  const { can } = usePermissions();
  const canWrite = can('workflows', 'write');
  const { showSuccess, showError } = useNotification();

  // Workflow list
  const [workflows, setWorkflows] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [saving, setSaving] = useState(false);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  // Services (STDIN source)
  const [services, setServices] = useState([]);
  const [newWfService, setNewWfService] = useState(null);

  // Dialogs
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWfName, setNewWfName] = useState('');
  const [newWfType, setNewWfType] = useState('event');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [wfToDelete, setWfToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load Example menu
  const [exampleMenuAnchor, setExampleMenuAnchor] = useState(null);

  const reactFlowWrapper = useRef(null);

  /* ─── Fetch workflows ────────────────────────────────────────── */
  const fetchWorkflows = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await workflowsApi.getWorkflows();
      const list = Array.isArray(res) ? res : res?.data || [];
      setWorkflows(list);
    } catch {
      showError?.('Failed to load workflows');
      setWorkflows([]);
    } finally {
      setLoadingList(false);
    }
  }, [showError]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await servicesApi.list({ per_page: 500 });
      const list = Array.isArray(res) ? res : res?.data || [];
      setServices(list);
    } catch {
      setServices([]);
    }
  }, []);

  useEffect(() => { fetchWorkflows(); fetchServices(); }, [fetchWorkflows, fetchServices]);

  useEffect(() => {
    const handler = () => { fetchWorkflows(); fetchServices(); };
    window.addEventListener('environmentChanged', handler);
    return () => window.removeEventListener('environmentChanged', handler);
  }, [fetchWorkflows, fetchServices]);

  /* ─── Load a workflow into the canvas ─────────────────────────── */
  const loadWorkflow = useCallback(async (wf) => {
    try {
      const full = await workflowsApi.getWorkflow(wf.uuid);
      const fd = parseFlowData(full.flow_data);
      setActiveWorkflow(full);
      setSelectedNode(null);

      if (fd?.nodes?.length) {
        setNodes(fd.nodes);
        setEdges(fd.edges || []);
      } else {
        const t = FLOW_TEMPLATES[0];
        setNodes(t.nodes);
        setEdges(t.edges);
      }
    } catch {
      showError?.('Failed to load workflow');
    }
  }, [showError, setNodes, setEdges]);

  // Deep-link: /workflow?open=<uuid> loads that workflow straight into the
  // canvas (used by the Services screen's workflow nodes). Runs once on mount.
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current) return;
    const uuid = new URLSearchParams(window.location.search).get('open');
    if (uuid) {
      deepLinkedRef.current = true;
      loadWorkflow({ uuid });
    }
  }, [loadWorkflow]);

  /* ─── Save flow_data ──────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    if (!activeWorkflow?.uuid) return;
    setSaving(true);
    try {
      const payload = { flow_data: { nodes, edges } };
      if (activeWorkflow.service_uuid) payload.service_uuid = activeWorkflow.service_uuid;
      await workflowsApi.updateWorkflow(activeWorkflow.uuid, payload);
      showSuccess?.('Workflow saved');
      fetchWorkflows();
    } catch (err) {
      showError?.(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [activeWorkflow, nodes, edges, showSuccess, showError, fetchWorkflows]);

  /* ─── Create new workflow (with template) ─────────────────────── */
  const handleCreate = useCallback(async () => {
    if (!newWfName.trim()) return;
    setSaving(true);
    try {
      const template = FLOW_TEMPLATES.find((t) => t.key === selectedTemplate) || FLOW_TEMPLATES[0];
      const payload = {
        name: newWfName.trim(),
        type: newWfType,
        enabled: true,
        nodes: template.nodes,
        edges: template.edges,
      };
      if (newWfService?.uuid) payload.service_uuid = newWfService.uuid;
      const res = await workflowsApi.createWorkflow(payload);
      showSuccess?.('Workflow created');
      setCreateDialogOpen(false);
      setNewWfName('');
      setSelectedTemplate('blank');
      setNewWfService(null);
      await fetchWorkflows();
      if (res?.uuid) loadWorkflow({ uuid: res.uuid });
    } catch (err) {
      showError?.(err?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  }, [newWfName, newWfType, selectedTemplate, showSuccess, showError, fetchWorkflows, loadWorkflow]);

  /* ─── Delete workflow ─────────────────────────────────────────── */
  const handleDelete = useCallback(async () => {
    if (!wfToDelete) return;
    setDeleting(true);
    try {
      await workflowsApi.deleteWorkflow(wfToDelete.uuid);
      showSuccess?.('Workflow deleted');
      setDeleteDialogOpen(false);
      if (activeWorkflow?.uuid === wfToDelete.uuid) {
        setActiveWorkflow(null);
        setNodes([]);
        setEdges([]);
        setSelectedNode(null);
      }
      setWfToDelete(null);
      fetchWorkflows();
    } catch {
      showError?.('Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [wfToDelete, activeWorkflow, showSuccess, showError, fetchWorkflows, setNodes, setEdges]);

  /* ─── Load a template into the active workflow ──────────────────── */
  const handleLoadExample = useCallback((templateKey) => {
    const template = FLOW_TEMPLATES.find((t) => t.key === templateKey);
    if (!template || !activeWorkflow) return;
    setNodes(template.nodes);
    setEdges(template.edges);
    setSelectedNode(null);
    setExampleMenuAnchor(null);
    showSuccess?.(`Loaded "${template.name}" template`);
  }, [activeWorkflow, setNodes, setEdges, showSuccess]);

  /* ─── Update service on active workflow ────────────────────────── */
  const handleServiceChange = useCallback(async (service) => {
    if (!activeWorkflow?.uuid) return;
    const serviceUuid = service?.uuid || '';
    try {
      await workflowsApi.updateWorkflow(activeWorkflow.uuid, { service_uuid: serviceUuid });
      setActiveWorkflow((prev) => ({ ...prev, service_uuid: serviceUuid }));
      showSuccess?.(service ? `Service set to "${service.name}"` : 'Service removed');
    } catch {
      showError?.('Failed to update service');
    }
  }, [activeWorkflow, showSuccess, showError]);

  /* ─── Add cog node (auto-connect to chain) ────────────────────── */
  const addCogNode = useCallback((cogType) => {
    if (!activeWorkflow) return;
    const id = nextId();
    const cfg = COG_TYPE_CONFIG[cogType];

    // Find the last non-end cog node, or start node
    const endNode = nodes.find((n) => n.type === 'end');
    const cogNodes = nodes.filter((n) => n.type === 'roast_cog');
    const lastCog = cogNodes.length > 0 ? cogNodes[cogNodes.length - 1] : null;
    const startNode = nodes.find((n) => n.type === 'start');
    const connectFrom = lastCog || startNode;

    // Position below the last node
    const refNode = lastCog || startNode || { position: { x: 200, y: 0 } };
    const newY = (refNode.position?.y || 0) + 180;

    const newNode = {
      id,
      type: 'roast_cog',
      position: { x: 160, y: newY },
      data: {
        cog_type: cogType,
        name: cfg.label.toLowerCase(),
        code: '',
        config: {},
        label: cfg.label,
      },
    };

    const newEdges = [];

    // Auto-connect: remove old edge from connectFrom→end, add connectFrom→new, new→end
    if (connectFrom) {
      const fromHandle = connectFrom.type === 'start' ? 'default' : 'done';

      // Remove existing edge from connectFrom to end
      if (endNode) {
        setEdges((eds) => eds.filter((e) => !(e.source === connectFrom.id && e.target === endNode.id)));
      }

      // Connect from previous → new node
      newEdges.push({
        id: nextEdgeId(),
        source: connectFrom.id,
        sourceHandle: fromHandle,
        target: id,
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#90a4ae' },
        style: { stroke: '#90a4ae', strokeWidth: 1.5 },
      });

      // Connect new node → end
      if (endNode) {
        // Move end node down
        setNodes((nds) => nds.map((n) =>
          n.id === endNode.id ? { ...n, position: { ...n.position, y: newY + 180 } } : n
        ));
        newEdges.push({
          id: nextEdgeId(),
          source: id,
          sourceHandle: 'done',
          target: endNode.id,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#90a4ae' },
          style: { stroke: '#90a4ae', strokeWidth: 1.5 },
        });
      }
    }

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, ...newEdges]);

    // Auto-select the new node to open editor
    setTimeout(() => setSelectedNode(newNode), 50);
  }, [activeWorkflow, nodes, setNodes, setEdges]);

  /* ─── Canvas interactions ─────────────────────────────────────── */
  const onConnect = useCallback((params) => {
    const isError = params.sourceHandle === 'error';
    const newEdge = {
      ...params,
      id: nextEdgeId(),
      type: 'smoothstep',
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed, width: 14, height: 14,
        color: isError ? '#e53935' : '#90a4ae',
      },
      style: {
        stroke: isError ? '#e53935' : '#90a4ae',
        strokeWidth: 1.5,
        strokeDasharray: isError ? '6 3' : 'none',
      },
      label: isError ? 'error' : '',
    };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_, node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  /* ─── Update node data (from editor panel) ────────────────────── */
  const handleUpdateNode = useCallback((nodeId, newData) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: newData } : n));
    setSelectedNode((prev) => prev?.id === nodeId ? { ...prev, data: newData } : prev);
  }, [setNodes]);

  /* ─── Delete a node ───────────────────────────────────────────── */
  const handleDeleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  /* ═══════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════ */
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 2, py: 0.75,
        borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper', flexShrink: 0,
      }}>
        <FlowIcon color="primary" sx={{ fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: '0.9rem' }}>
          {activeWorkflow ? activeWorkflow.name : 'Workflow Builder'}
        </Typography>
        {activeWorkflow && (
          <>
            <Chip label={activeWorkflow.type} size="small" color="info" sx={{ fontSize: '0.65rem', height: 20 }} />
            <DotIcon sx={{ fontSize: 10, color: activeWorkflow.enabled ? '#43a047' : '#bdbdbd' }} />

            {/* Service (STDIN) picker */}
            <Autocomplete
              size="small"
              disabled={!canWrite}
              options={services}
              getOptionLabel={(opt) => opt?.name || ''}
              value={services.find((s) => s.uuid === activeWorkflow.service_uuid) || null}
              onChange={(_, val) => handleServiceChange(val)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Service (STDIN)"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: <InputIcon sx={{ fontSize: 14, color: 'text.disabled', mr: 0.5 }} />,
                  }}
                />
              )}
              sx={{ width: 200, '& .MuiInputBase-root': { fontSize: '0.78rem', py: 0 } }}
              disableClearable={false}
            />
          </>
        )}
        <Box sx={{ flex: 1 }} />
        {activeWorkflow && canWrite && (
          <>
            <Button size="small" variant="contained" onClick={handleSave} disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
              Save
            </Button>
            <Tooltip title="Load example template">
              <IconButton size="small" onClick={(e) => setExampleMenuAnchor(e.currentTarget)}>
                <LoadTemplateIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="View generated code">
              <IconButton size="small" onClick={() => setCodeDialogOpen(true)}><CodeIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title={testOpen ? 'Hide test panel' : 'Test workflow'}>
              <IconButton size="small" onClick={() => setTestOpen(!testOpen)}
                color={testOpen ? 'success' : 'default'}>
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="Refresh list">
          <IconButton size="small" onClick={fetchWorkflows} disabled={loadingList}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Main: Sidebar + Canvas + Editor ──────────────────────── */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── Sidebar ────────────────────────────────────────────── */}
        <Box className="wf-sidebar">
          {/* Workflow list header */}
          <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="overline" sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1 }}>
              Workflows
            </Typography>
            {canWrite && (
              <Tooltip title="New Workflow">
                <IconButton size="small" onClick={() => setCreateDialogOpen(true)}>
                  <AddIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Workflow list */}
          <Box sx={{ flex: 1, overflow: 'auto', px: 0.5 }}>
            {loadingList ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={20} /></Box>
            ) : workflows.length === 0 ? (
              <Box sx={{ px: 1, py: 2, textAlign: 'center' }}>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
                  No workflows yet
                </Typography>
                {canWrite && (
                  <Button size="small" variant="outlined" startIcon={<AddIcon />}
                    onClick={() => setCreateDialogOpen(true)}
                    sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                    Create first workflow
                  </Button>
                )}
              </Box>
            ) : (
              <List dense disablePadding>
                {workflows.map((wf) => (
                  <ListItemButton
                    key={wf.uuid}
                    selected={activeWorkflow?.uuid === wf.uuid}
                    onClick={() => loadWorkflow(wf)}
                    sx={{ borderRadius: 1, mb: 0.25, py: 0.4, px: 1, minHeight: 0 }}
                  >
                    <ListItemIcon sx={{ minWidth: 24 }}>
                      <DotIcon sx={{ fontSize: 8, color: wf.enabled ? '#43a047' : '#bdbdbd' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={wf.name}
                      secondary={
                        wf.service_uuid
                          ? `${wf.type} · ${services.find((s) => s.uuid === wf.service_uuid)?.name || 'service'}`
                          : wf.type
                      }
                      primaryTypographyProps={{ variant: 'body2', fontSize: '0.78rem', noWrap: true, fontWeight: activeWorkflow?.uuid === wf.uuid ? 600 : 400 }}
                      secondaryTypographyProps={{ variant: 'caption', fontSize: '0.6rem', noWrap: true }}
                    />
                    {canWrite && (
                      <IconButton size="small"
                        onClick={(e) => { e.stopPropagation(); setWfToDelete(wf); setDeleteDialogOpen(true); }}
                        sx={{ opacity: 0, '.MuiListItemButton-root:hover &': { opacity: 1 }, p: 0.25 }}>
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>

          <Divider />

          {/* Recent runs (sessions) */}
          <WorkflowRunsPanel activeWorkflowUuid={activeWorkflow?.uuid} />

          <Divider />

          {/* Cog palette */}
          <Box sx={{ px: 1.5, pt: 1, pb: 1.5 }}>
            <Typography variant="overline" sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, mb: 0.5, display: 'block', color: 'text.secondary' }}>
              Add Cog Node
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {COG_PALETTE.map((cog) => {
                const Icon = cog.icon;
                return (
                  <Button
                    key={cog.key}
                    size="small"
                    variant="outlined"
                    startIcon={<Icon sx={{ fontSize: 14 }} />}
                    onClick={() => addCogNode(cog.key)}
                    disabled={!activeWorkflow || !canWrite}
                    sx={{
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      borderColor: `${cog.color}66`,
                      color: cog.color,
                      fontSize: '0.75rem',
                      py: 0.4,
                      '&:hover': { bgcolor: `${cog.color}0a`, borderColor: cog.color },
                    }}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>{cog.label}</span>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.55rem', ml: 0.5 }}>
                      {cog.desc?.split(' ').slice(0, 2).join(' ')}
                    </Typography>
                  </Button>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* ── Center: Canvas + Test panel ────────────────────────── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {!activeWorkflow ? (
            /* Empty state */
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
                <FlowIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" fontWeight={500} sx={{ mb: 1 }}>
                  Workflow Builder
                </Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
                  Build visual workflows using Roast cogs — Ruby code, shell commands, LLM prompts, and AI agents
                  chained together with done/error branching.
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
                  Select a workflow from the sidebar, or create a new one from a template.
                </Typography>
                {canWrite && (
                  <Button variant="contained" startIcon={<AddIcon />}
                    onClick={() => setCreateDialogOpen(true)}
                    sx={{ textTransform: 'none' }}>
                    New Workflow
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            <>
              {/* See DesktopRecommended: a node-graph editor is not usable at
                  phone width, and saying so beats a canvas that renders and
                  cannot be worked with. */}
              <DesktopRecommended />
              {/* Canvas */}
              {/* dir only — see the note in PBXRoutingView. The ref is used
                  for drop coordinates, so it must stay on this element. */}
              <Box dir="ltr" className="wf-canvas" ref={reactFlowWrapper} sx={{ flex: 1, minHeight: 0 }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  defaultEdgeOptions={defaultEdgeOptions}
                  onNodeClick={onNodeClick}
                  onPaneClick={onPaneClick}
                  nodesDraggable={canWrite}
                  nodesConnectable={canWrite}
                  elementsSelectable
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  minZoom={0.2}
                  maxZoom={2}
                  deleteKeyCode={null}
                >
                  <Controls showInteractive={false} />
                  <MiniMap nodeStrokeWidth={2} zoomable pannable style={{ height: 80, width: 120 }} />
                  <Background variant="dots" gap={16} size={1} />
                </ReactFlow>
              </Box>

              {/* Test panel (collapsible bottom) */}
              <Collapse in={testOpen}>
                <Paper elevation={2} sx={{ borderTop: '2px solid', borderColor: 'success.main', flexShrink: 0, maxHeight: '45vh', overflow: 'auto' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 1 }}>
                    <PlayArrowIcon sx={{ fontSize: 16, color: 'success.main', mr: 0.5 }} />
                    <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, fontSize: '0.8rem' }}>
                      Test Simulator
                    </Typography>
                    <IconButton size="small" onClick={() => setTestOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
                  </Box>
                  <TestPanel workflow={activeWorkflow} />
                </Paper>
              </Collapse>
            </>
          )}
        </Box>

        {/* ── Editor Panel (right side) ──────────────────────────── */}
        {selectedNode && (
          <Paper elevation={2} className="wf-editor" sx={{ width: 'min(420px, 38vw)', minWidth: 340, display: 'flex', flexDirection: 'column' }}>
            <EditorPanel
              node={selectedNode}
              onUpdate={handleUpdateNode}
              onDelete={handleDeleteNode}
              onClose={() => setSelectedNode(null)}
            />
          </Paper>
        )}
      </Box>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <ViewCodeDialog
        open={codeDialogOpen}
        onClose={() => setCodeDialogOpen(false)}
        workflow={activeWorkflow}
      />

      {/* Create workflow dialog with template picker */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Workflow</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Name" value={newWfName} onChange={(e) => setNewWfName(e.target.value)}
              fullWidth required size="small" autoFocus placeholder="e.g. crm-webhook, call-logger" />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={newWfType} label="Type" onChange={(e) => setNewWfType(e.target.value)}>
                {['event', 'campaign', 'widget', 'report', 'alert', 'route'].map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Autocomplete
              size="small"
              options={services}
              getOptionLabel={(opt) => opt?.name || ''}
              value={newWfService}
              onChange={(_, val) => setNewWfService(val)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Service (STDIN)"
                  placeholder="Event source service"
                  helperText="The service that triggers this workflow"
                />
              )}
              fullWidth
            />

            <Divider />

            <Typography variant="subtitle2" fontWeight={600}>Start from template</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {FLOW_TEMPLATES.map((t) => (
                <Paper
                  key={t.key}
                  variant="outlined"
                  onClick={() => setSelectedTemplate(t.key)}
                  sx={{
                    p: 1.5, cursor: 'pointer',
                    borderColor: selectedTemplate === t.key ? 'primary.main' : 'divider',
                    bgcolor: selectedTemplate === t.key ? 'rgba(25, 118, 210, 0.04)' : 'transparent',
                    '&:hover': { borderColor: 'primary.main' },
                    transition: 'border-color 0.15s',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlowIcon sx={{ fontSize: 16, color: selectedTemplate === t.key ? 'primary.main' : 'text.disabled' }} />
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{t.name}</Typography>
                    <Chip
                      label={`${t.nodes.filter((n) => n.type === 'roast_cog').length} cog${t.nodes.filter((n) => n.type === 'roast_cog').length !== 1 ? 's' : ''}`}
                      size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 3.5 }}>{t.desc}</Typography>
                </Paper>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newWfName.trim() || saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Load Example menu */}
      <Menu
        anchorEl={exampleMenuAnchor}
        open={Boolean(exampleMenuAnchor)}
        onClose={() => setExampleMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary">
            Load Example Template
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.6rem' }}>
            Replaces current canvas (save first!)
          </Typography>
        </Box>
        {FLOW_TEMPLATES.map((t) => (
          <MenuItem key={t.key} onClick={() => handleLoadExample(t.key)} sx={{ py: 0.75 }}>
            <ListItemIcon><FlowIcon sx={{ fontSize: 16 }} /></ListItemIcon>
            <ListItemText
              primary={t.name}
              secondary={t.desc}
              primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 500 }}
              secondaryTypographyProps={{ fontSize: '0.65rem' }}
            />
            <Chip
              label={`${t.nodes.filter((n) => n.type === 'roast_cog').length} cog${t.nodes.filter((n) => n.type === 'roast_cog').length !== 1 ? 's' : ''}`}
              size="small" variant="outlined" sx={{ fontSize: '0.55rem', height: 16, ml: 1 }}
            />
          </MenuItem>
        ))}
      </Menu>

      {/* Delete dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setWfToDelete(null); }}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Workflow"
        entityName={wfToDelete?.name}
      />
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Wrapper with ReactFlowProvider
   ═══════════════════════════════════════════════════════════════════ */
const WorkflowManage = () => (
  <ReactFlowProvider>
    <WorkflowCanvas />
  </ReactFlowProvider>
);

export default WorkflowManage;
