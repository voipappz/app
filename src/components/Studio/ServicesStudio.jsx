import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import ReactFlow, { Background, Controls, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box, List, ListItemButton, ListItemText, Button, IconButton, Typography,
  Chip, Tooltip, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert, TextField,
  Switch, FormControlLabel, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BoltIcon from '@mui/icons-material/Bolt';
import HubIcon from '@mui/icons-material/Hub';
import WebhookIcon from '@mui/icons-material/Webhook';
import SmsIcon from '@mui/icons-material/Sms';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ArticleIcon from '@mui/icons-material/Article';
import CampaignIcon from '@mui/icons-material/Campaign';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { servicesApi } from '../../services/api/servicesApi';
import { logsApi } from '../../services/api/logsApi';
import { workflowsApi } from '../../services/api/workflowsApi';
import ServiceDialog from '../Services/ServiceDialog.jsx';
import ServiceWizard from '../Services/ServiceWizard/ServiceWizard.jsx';
import EventPipelineBuilder from '../Services/EventPipelineBuilder/EventPipelineBuilder.jsx';
import CogNode, { StartNode, EndNode } from '../Workflows/nodes/CogNode';
import './Studio.css';

// Workflow-preview node types — same renderers the Workflow builder uses.
const WF_NODE_TYPES = { start: StartNode, roast_cog: CogNode, end: EndNode };

const parseFlowData = (fd) => {
  if (!fd) return null;
  if (typeof fd === 'string') { try { return JSON.parse(fd); } catch { return null; } }
  return fd;
};

const asArray = (r) => (Array.isArray(r) ? r : (r?.data || r?.services || []));

const cardNode = (id, x, y, label, sub, color, extra = {}, icon = null) => ({
  id,
  position: { x, y },
  data: {
    label: (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, textAlign: 'left' }}>
        {icon && (
          <Box sx={{ width: 30, height: 30, borderRadius: '9px', flexShrink: 0, bgcolor: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{label}</Typography>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>{sub}</Typography>
        </Box>
      </Box>
    ),
    ...extra,
  },
  style: { width: 210, borderRadius: 12, border: `1.5px solid ${color}`, padding: 11, background: 'var(--mui-palette-background-paper)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  sourcePosition: 'right',
  targetPosition: 'left',
});

// Friendly label + icon + one-line summary for each handler (what the service DOES).
const HANDLER_LABEL = { webhook: 'Webhook', sms: 'SMS', workflow: 'Workflow', notify: 'Notify', log: 'Log', publish_event: 'Publish Event' };
const HANDLER_ICON = {
  webhook: <WebhookIcon sx={{ fontSize: 18 }} />,
  sms: <SmsIcon sx={{ fontSize: 18 }} />,
  workflow: <AccountTreeIcon sx={{ fontSize: 18 }} />,
  notify: <NotificationsActiveIcon sx={{ fontSize: 18 }} />,
  log: <ArticleIcon sx={{ fontSize: 18 }} />,
  publish_event: <CampaignIcon sx={{ fontSize: 18 }} />,
};
// API stores webhook method lowercase: post | get | post_url_encoded
const METHOD_LABEL = { post: 'POST', get: 'GET', post_url_encoded: 'POST (URL Encoded)' };
function handlerSummary(handler, p = {}, meta = {}) {
  switch (handler) {
    case 'webhook': {
      const fields = Object.keys(meta || {}).length;
      const auth = p.basic_auth_username ? ' · Basic auth' : '';
      return `${METHOD_LABEL[p.method] || String(p.method || 'POST').toUpperCase()} ${p.url || '—'} · ${fields} request field${fields === 1 ? '' : 's'}${auth}`;
    }
    case 'sms': return p.to ? `to ${p.to}` : (p.message || 'send SMS');
    case 'workflow': return 'run workflow';
    case 'notify': return p.channel ? `#${p.channel}` : 'notify';
    case 'log': return `level ${p.level || 'info'}`;
    case 'publish_event': return p.event_type || 'publish event';
    default: return handler;
  }
}

// Fixed action per service type. Workflow services are NOT service flows: they
// render their Roast workflow unchanged.
function pocketAction(service) {
  const p = service.profile || {};
  // Dispatch is absolute by service.type (server-declared node)
  switch (service.type === 'notification' ? 'notify' : service.type) {
    case 'powerlink':
    case 'fireberry': return { label: 'Fireberry CRM', sub: 'managed contact + ticket flow', icon: <WebhookIcon sx={{ fontSize: 18 }} />, ok: 'contact · ticket' };
    case 'transcribe': return { label: 'Transcribe', sub: 'call recording → text', icon: <ArticleIcon sx={{ fontSize: 18 }} />, ok: 'transcript saved' };
    case 'webhook': return { label: 'Send webhook', sub: handlerSummary('webhook', p, service.meta), icon: <WebhookIcon sx={{ fontSize: 18 }} />, ok: 'HTTP response' };
    case 'sms': return { label: 'Send SMS', sub: handlerSummary('sms', p), icon: <SmsIcon sx={{ fontSize: 18 }} />, ok: 'delivered' };
    case 'notify': return { label: 'Notify', sub: handlerSummary('notify', p), icon: <NotificationsActiveIcon sx={{ fontSize: 18 }} />, ok: 'sent' };
    case 'log': return { label: 'Write log', sub: handlerSummary('log', p), icon: <ArticleIcon sx={{ fontSize: 18 }} />, ok: 'logged' };
    case 'publish_event': return { label: 'Publish event', sub: handlerSummary('publish_event', p), icon: <CampaignIcon sx={{ fontSize: 18 }} />, ok: 'published' };
    default: return null;
  }
}

// A service is an event listener. Managed types render the exact static steps
// declared by the API; direct types render their one action. Workflow services
// render the Roast workflow, unchanged.
function buildServiceFlow(service, typeConfig = {}, linkedWorkflows = []) {
  if (!service) return { nodes: [], edges: [] };
  const triggers = Array.isArray(service.triggers) ? service.triggers : [];
  const isWorkflowType = service.type === 'workflow';
  const nodes = [];
  const edges = [];

  nodes.push(cardNode('trigger', 0, 70, 'Triggers', triggers.length ? triggers.join(', ') : 'No triggers', '#2563eb', {}, <BoltIcon sx={{ fontSize: 18 }} />));

  const steps = Array.isArray(typeConfig.steps) ? typeConfig.steps : [];
  const action = isWorkflowType ? null : pocketAction(service);
  if (steps.length > 0) {
    const xStart = 280;
    const xGap = 240;
    const y = 70;

    steps.forEach((step, index) => {
      const id = `step-${step.key}`;
      nodes.push(cardNode(id, xStart + index * xGap, y, step.label || step.key,
        step.description || '', '#3A8E91', { openEdit: true }, <WebhookIcon sx={{ fontSize: 18 }} />));
    });
    edges.push({ id: 'e-t-step', source: 'trigger', target: `step-${steps[0].key}`, animated: true });

    steps.forEach((step) => {
      const outcomes = step.on && typeof step.on === 'object' ? Object.values(step.on) : [];
      outcomes.forEach((nextKey, outcomeIndex) => {
        if (steps.some((candidate) => candidate.key === nextKey)) {
          edges.push({
            id: `e-${step.key}-${nextKey}-${outcomeIndex}`,
            source: `step-${step.key}`,
            target: `step-${nextKey}`,
            label: Object.keys(step.on)[outcomeIndex],
            animated: true,
          });
        }
      });
    });

    const terminal = steps.filter((step) => !Object.keys(step.on || {}).length);
    nodes.push(cardNode('ok', xStart + steps.length * xGap, 20, 'Success', 'managed flow complete', '#16a34a', {}, <CheckCircleIcon sx={{ fontSize: 18 }} />));
    nodes.push(cardNode('fail', xStart + steps.length * xGap, 130, 'Fail', 'error logged · audit', '#dc2626', {}, <CancelIcon sx={{ fontSize: 18 }} />));
    terminal.forEach((step) => edges.push({ id: `e-${step.key}-ok`, source: `step-${step.key}`, target: 'ok', animated: true }));
    steps.forEach((step) => edges.push({ id: `e-${step.key}-fail`, source: `step-${step.key}`, target: 'fail' }));
    return { nodes, edges };
  }

  if (action) {
    // Direct service: Trigger → action → Success / Fail.
    nodes.push(cardNode('action', 280, 70, action.label, action.sub, '#3A8E91', { openEdit: true }, action.icon));
    edges.push({ id: 'e-t-a', source: 'trigger', target: 'action', animated: true });
    nodes.push(cardNode('ok', 560, 20, 'Success', action.ok, '#16a34a', {}, <CheckCircleIcon sx={{ fontSize: 18 }} />));
    nodes.push(cardNode('fail', 560, 130, 'Fail', 'error logged · audit', '#dc2626', {}, <CancelIcon sx={{ fontSize: 18 }} />));
    edges.push({ id: 'e-a-ok', source: 'action', target: 'ok', animated: true });
    edges.push({ id: 'e-a-fail', source: 'action', target: 'fail' });

    // Custom logic — an attached workflow rides alongside the direct service.
    linkedWorkflows.forEach((w, i) => {
      const nid = `wf-${w.uuid}`;
      nodes.push(cardNode(nid, 280, 240 + i * 100, 'Workflow', w.name || 'workflow', '#7c3aed', { workflowUuid: w.uuid }, <AccountTreeIcon sx={{ fontSize: 18 }} />));
      edges.push({ id: `e-t-${nid}`, source: 'trigger', target: nid, animated: true });
    });
    return { nodes, edges };
  }

  // Workflow services — unchanged: Trigger → Service → Roast workflow.
  nodes.push(cardNode('service', 280, 70, 'Service', service.type, '#65758E', { openEdit: true }, <HubIcon sx={{ fontSize: 18 }} />));
  edges.push({ id: 'e-t-s', source: 'trigger', target: 'service', animated: true });

  if (isWorkflowType) {
    nodes.push(cardNode('handler', 560, 70, 'Workflow', 'routes to linked workflows', '#7c3aed',
      { workflowUuid: service.profile?.workflow_uuid || true }, <AccountTreeIcon sx={{ fontSize: 18 }} />));
    edges.push({ id: 'e-s-handler', source: 'service', target: 'handler', animated: true });
  } else {
    const wfs = linkedWorkflows.length
      ? linkedWorkflows
      : [{ __placeholder: true, name: 'No workflow attached — click “Attach workflow”' }];
    wfs.forEach((w, i) => {
      const nid = `wf-${w.uuid || `ph-${i}`}`;
      nodes.push(cardNode(nid, 560, i * 100 + 20, 'Workflow', w.name || 'workflow', '#7c3aed',
        { workflowUuid: w.uuid || null, ...(w.__placeholder ? { openAttach: true } : {}) }, <AccountTreeIcon sx={{ fontSize: 18 }} />));
      edges.push({ id: `e-s-${nid}`, source: 'service', target: nid, animated: !!w.uuid });
    });
  }

  return { nodes, edges };
}

const ServicesInner = () => {
  const navigate = useNavigate();
  const { selectedEnvironments } = useCustomerEnvironment();
  const envUuid = selectedEnvironments?.[0]?.uuid;
  // Every selected application, for scoping the list. `envUuid` (the first
  // one) stays for the single-environment API params below, which take one.
  const envUuids = useMemo(
    () => (selectedEnvironments || []).map((e) => e?.uuid).filter(Boolean),
    [selectedEnvironments]
  );

  const [services, setServices] = useState([]);
  const [typeConfigs, setTypeConfigs] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Workflow attachment (for services that route to workflows — i.e. no handler)
  const [linkedWorkflows, setLinkedWorkflows] = useState([]);
  // What this service's dispatches actually did. Service#logs existed in the API
  // all along, but /logs had no `service` subject, so the request 406'd and this
  // screen could only show configuration, never behaviour.
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  // "no logs" and "the request failed" looked identical — both rendered an empty
  // panel, so a 406 from the API was indistinguishable from a quiet service.
  const [logsError, setLogsError] = useState(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [envWorkflows, setEnvWorkflows] = useState([]);
  const [pickWorkflow, setPickWorkflow] = useState('');
  const [attaching, setAttaching] = useState(false);

  // Simulate — fire a (call) event through the service and see what runs.
  const [simOpen, setSimOpen] = useState(false);
  const [simEvent, setSimEvent] = useState('');
  const [simData, setSimData] = useState('{ "simulated": true }');
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // Inline setup (the config area above the flow) — same fields as Edit.
  const [setup, setSetup] = useState(null);
  const [setupSaving, setSetupSaving] = useState(false);

  // Attached workflow preview — the current workflow's flow, shown up top.
  const [wfPreview, setWfPreview] = useState(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      // Scope to the SELECTED SET, not one environment. Filtering on a single
      // uuid hid every service belonging to the other selected applications —
      // with many selected that's almost all of them. The API takes one
      // environment_uuid and can't express "any of these", so fetch unscoped
      // and intersect here.
      const list = asArray(await servicesApi.list({}));
      const scoped = envUuids.length
        ? list.filter((s) => {
            const envs = s.environment_uuids;
            // No environments on the service = not application-scoped; keep it
            // visible rather than hiding it from every view.
            if (!Array.isArray(envs) || envs.length === 0) return true;
            return envs.some((u) => envUuids.includes(u));
          })
        : list;
      setServices(scoped);
      setSelected((prev) => scoped.find((s) => s.uuid === prev?.uuid) || scoped[0] || null);
    } finally {
      setLoading(false);
    }
  }, [envUuids]);

  // The LIST serializer omits `profile` — fetch the full record for the
  // selected service so handler config drives the canvas + setup.
  const [full, setFull] = useState(null);
  const fetchFull = useCallback(async () => {
    if (!selected?.uuid) { setFull(null); return; }
    try {
      const r = await servicesApi.get(selected.uuid);
      setFull(r?.data || r || null);
    } catch { setFull(null); }
  }, [selected?.uuid]);
  useEffect(() => { fetchFull(); }, [fetchFull]);
  const svc = useMemo(
    () => (full && full.uuid === selected?.uuid ? { ...selected, ...full } : selected),
    [selected, full]);

  // Load the workflows linked to the selected service (service_uuid match) —
  // Direct and managed services show attached workflows as custom logic.
  const fetchLinkedWorkflows = useCallback(async () => {
    if (!selected?.uuid) { setLinkedWorkflows([]); return; }
    try {
      const params = { search: { service_uuid: selected.uuid } };
      if (envUuid) params.environment_uuid = envUuid;
      setLinkedWorkflows(asArray(await workflowsApi.getWorkflows(params)));
    } catch { setLinkedWorkflows([]); }
  }, [selected, envUuid]);

  const fetchLogs = useCallback(async () => {
    if (!selected?.uuid) { setLogs([]); return; }
    setLogsLoading(true);
    setLogsError(null);
    try {
      const r = await logsApi.fetchLogs({ subject: 'service', subject_uuid: selected.uuid, per_page: 50 });
      setLogs(asArray(r));
    } catch (e) {
      setLogs([]);
      setLogsError(e?.response?.data?.message || e?.message || 'Could not load logs');
    }
    finally { setLogsLoading(false); }
  }, [selected?.uuid]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => { fetchServices(); }, [fetchServices]);
  useEffect(() => {
    servicesApi.getTypes().then((t) => setTypeConfigs(t && typeof t === 'object' ? t : {})).catch(() => {});
  }, []);
  useEffect(() => { fetchLinkedWorkflows(); }, [fetchLinkedWorkflows]);

  // Seed the inline setup from the selected service (same extraction as Edit).
  useEffect(() => {
    if (!svc) { setSetup(null); return; }
    setSetup({
      name: svc.name || '',
      enabled: svc.enabled !== false,
      triggers: Array.isArray(svc.triggers) ? svc.triggers : [],
    });
  }, [svc]);

  // Save the inline setup — same payload the Edit dialog builds.
  const saveSetup = useCallback(async () => {
    if (!selected?.uuid || !setup) return;
    setSetupSaving(true);
    try {
      const profile = { ...(svc.profile || {}) };
      delete profile.code;
      delete profile.handler_type;
      await servicesApi.update(selected.uuid, {
        name: setup.name,
        type: svc.type,
        enabled: setup.enabled,
        triggers: setup.triggers || [],
        environment_uuids: svc.environment_uuids || [],
        profile,
        notes: svc.notes,
      });
      await fetchServices();
      await fetchFull();
    } finally {
      setSetupSaving(false);
    }
  }, [selected, svc, setup, fetchServices, fetchFull]);

  const setupDirty = useMemo(() => {
    if (!svc || !setup) return false;
    return setup.name !== (svc.name || '')
      || setup.enabled !== (svc.enabled !== false)
      || JSON.stringify(setup.triggers) !== JSON.stringify(svc.triggers || []);
  }, [svc, setup]);

  // Load the attached workflow's flow for the preview: explicit handler
  // workflow_uuid first, else the first linked workflow.
  useEffect(() => {
    let cancelled = false;
    const wfUuid = svc?.profile?.workflow_uuid || linkedWorkflows[0]?.uuid;
    if (!wfUuid) { setWfPreview(null); return undefined; }
    workflowsApi.getWorkflow(wfUuid).then((full) => {
      if (cancelled) return;
      const fd = parseFlowData(full?.flow_data);
      setWfPreview({ uuid: wfUuid, name: full?.name || 'workflow', nodes: fd?.nodes || [], edges: fd?.edges || [] });
    }).catch(() => { if (!cancelled) setWfPreview(null); });
    return () => { cancelled = true; };
  }, [svc, linkedWorkflows]);

  // Attach an existing workflow → set its service_uuid to this service.
  const attachExisting = useCallback(async () => {
    if (!pickWorkflow || !selected?.uuid) return;
    setAttaching(true);
    try {
      await workflowsApi.updateWorkflow(pickWorkflow, { service_uuid: selected.uuid });
      setAttachOpen(false); setPickWorkflow('');
      await fetchLinkedWorkflows();
    } finally { setAttaching(false); }
  }, [pickWorkflow, selected, fetchLinkedWorkflows]);

  // Create a new workflow linked to this service, then open the builder.
  const createAndOpen = useCallback(async () => {
    if (!selected?.uuid) return;
    setAttaching(true);
    try {
      // Workflows are customer-scoped (not environment-bound) — the application
      // scoping lives on the service they're attached to.
      const created = await workflowsApi.createWorkflow({
        name: `${selected.name} workflow`,
        type: 'event',
        service_uuid: selected.uuid,
      });
      setAttachOpen(false);
      const uuid = created?.uuid || created?.data?.uuid;
      navigate(uuid ? `/workflow?open=${uuid}` : '/workflow');
    } finally { setAttaching(false); }
  }, [selected, envUuid, navigate]);

  const openAttach = useCallback(async () => {
    setAttachOpen(true); setPickWorkflow('');
    try {
      const params = envUuid ? { environment_uuid: envUuid, per_page: 200 } : { per_page: 200 };
      setEnvWorkflows(asArray(await workflowsApi.getWorkflows(params)));
    } catch { setEnvWorkflows([]); }
  }, [envUuid]);

  const onNodeClick = useCallback((_e, node) => {
    const d = node?.data || {};
    if (d.workflowUuid) { navigate(typeof d.workflowUuid === 'string' ? `/workflow?open=${d.workflowUuid}` : '/workflow'); return; }
    if (d.openAttach) { openAttach(); return; }
    if (d.openEdit) setEditing(true);
  }, [navigate, openAttach]);

  const openSim = useCallback(() => {
    setSimResult(null);
    setSimEvent(svc?.triggers?.[0] || '');
    setSimData('{ "simulated": true }');
    setSimOpen(true);
  }, [svc]);

  const runSim = useCallback(async () => {
    if (!selected?.uuid || !simEvent) return;
    setSimRunning(true); setSimResult(null);
    let event_data;
    try { event_data = simData.trim() ? JSON.parse(simData) : {}; }
    catch { setSimResult({ error: 'Event data is not valid JSON' }); setSimRunning(false); return; }
    try {
      const res = await servicesApi.simulate(selected.uuid, { event_name: simEvent, event_data });
      setSimResult(res || { event_name: simEvent, results: [] });
    } catch (err) {
      setSimResult({ error: err.message || 'Simulation failed' });
    } finally { setSimRunning(false); }
  }, [selected, simEvent, simData]);

  const serviceTypes = useMemo(() => Object.keys(typeConfigs), [typeConfigs]);
  const { nodes, edges } = useMemo(
    () => buildServiceFlow(svc, typeConfigs[svc?.type] || {}, linkedWorkflows),
    [svc, typeConfigs, linkedWorkflows]
  );

  return (
    <Box className="studio-routes" sx={{ flexDirection: 'row !important', height: '100%' }}>
      {/* Left — services list + easy add */}
      <Box className="services-list">
        <Box className="studio-header" sx={{ borderRight: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Services</Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Refresh"><span>
            <IconButton size="small" onClick={fetchServices} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
          </span></Tooltip>
        </Box>
        <Box sx={{ p: 1 }}>
          <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setWizardOpen(true)} sx={{ textTransform: 'none' }}>
            New Service
          </Button>
        </Box>
        <Divider />
        <List dense sx={{ overflowY: 'auto', flex: 1 }}>
          {services.map((s) => (
            <ListItemButton key={s.uuid} selected={selected?.uuid === s.uuid} onClick={() => setSelected(s)}
              sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', mr: 1, mt: 1,
                bgcolor: s.enabled ? 'var(--accent-success)' : 'var(--text-tertiary)' }} />
              <ListItemText
                primary={s.name}
                primaryTypographyProps={{ fontWeight: 600, noWrap: true }}
                secondaryTypographyProps={{ component: 'div' }}
                secondary={
                  // The row said name + type and nothing else, so telling two
                  // services of the same type apart meant opening both.
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                    <Chip label={s.type || 'no type'} size="small" variant="outlined"
                      color={typeConfigs[s.type] ? 'default' : 'error'}
                      sx={{ height: 16, fontSize: '0.6rem' }} />
                    <Chip label={`${(s.triggers || []).length} triggers`} size="small" variant="outlined"
                      sx={{ height: 16, fontSize: '0.6rem' }} />
                    {(s.environment_uuids || []).length > 0 && (
                      <Chip label={`${s.environment_uuids.length} apps`} size="small" variant="outlined"
                        sx={{ height: 16, fontSize: '0.6rem' }} />
                    )}
                    {!s.enabled && (
                      <Chip label="disabled" size="small" variant="outlined"
                        sx={{ height: 16, fontSize: '0.6rem' }} />
                    )}
                  </Box>
                } />
              <Tooltip title="Logs">
                <IconButton size="small" edge="end"
                  onClick={(e) => { e.stopPropagation(); setSelected(s); setLogsOpen(true); }}>
                  <ArticleIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </ListItemButton>
          ))}
          {!loading && services.length === 0 && (
            <Typography variant="body2" sx={{ p: 2, color: 'var(--text-secondary)' }}>No services — add one with “New Service”.</Typography>
          )}
        </List>
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Right — the selected service visualized as a node graph */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <Box className="studio-placeholder">
            <ExtensionIcon sx={{ fontSize: 48, color: 'var(--text-tertiary)' }} />
            <Typography sx={{ color: 'var(--text-secondary)' }}>Select a service to visualize its flow.</Typography>
          </Box>
        ) : (
          <>
            <Box className="studio-header">
              <Typography variant="h6" sx={{ fontWeight: 600 }}>{selected.name}</Typography>
              <Chip size="small" label={selected.type} sx={{ ml: 1 }} />
              <Box sx={{ flex: 1 }} />
              <Button size="small" variant="outlined" color="success" startIcon={<PlayArrowIcon />} sx={{ textTransform: 'none', mr: 1 }} onClick={openSim}>
                Simulate call
              </Button>
              {/* Custom logic — attaching a workflow is available on every service */}
              <Button size="small" variant="outlined" startIcon={<AccountTreeIcon />} sx={{ textTransform: 'none', mr: 1 }} onClick={openAttach}>
                Attach workflow
              </Button>
              <Button size="small" variant="outlined" startIcon={<EditIcon />} sx={{ textTransform: 'none', mr: 1 }} onClick={() => setEditing(true)}>Edit</Button>
              <Button size="small" variant="contained" startIcon={setupSaving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                disabled={!setupDirty || setupSaving} onClick={saveSetup} sx={{ textTransform: 'none' }}>
                Save
              </Button>
            </Box>

            {/* CONFIG — up top, all in one screen: name/enabled + triggers/handler
                setup, and the attached workflow's current flow when there is one. */}
            {setup && (
              <Box sx={{ display: 'flex', minHeight: 240, height: '44%', borderBottom: '1px solid var(--border-light, #e5e7eb)', overflow: 'hidden' }}>
                <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', p: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <TextField
                      label="Name" size="small" value={setup.name}
                      onChange={(e) => setSetup((s) => ({ ...s, name: e.target.value }))}
                      sx={{ flex: 1, maxWidth: 340 }}
                    />
                    <FormControlLabel
                      control={<Switch size="small" checked={setup.enabled} onChange={(e) => setSetup((s) => ({ ...s, enabled: e.target.checked }))} />}
                      label={<Typography variant="caption">Enabled</Typography>}
                      sx={{ m: 0 }}
                    />
                  </Box>
                  <EventPipelineBuilder
                    triggers={setup.triggers}
                    onTriggersChange={(t) => setSetup((s) => ({ ...s, triggers: t }))}
                    serviceUuid={selected.uuid}
                    serviceType={selected.type}
                    disabled={setupSaving}
                  />
                </Box>

                {/* Attached workflow — its current flow, live from the builder */}
                {wfPreview && (
                  <Box sx={{ width: '42%', minWidth: 320, borderLeft: '1px solid var(--border-light, #e5e7eb)', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: '1px solid var(--border-light, #e5e7eb)', bgcolor: '#faf5ff' }}>
                      <AccountTreeIcon sx={{ fontSize: 16, color: '#7c3aed' }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#7c3aed' }} noWrap>{wfPreview.name}</Typography>
                      <Box sx={{ flex: 1 }} />
                      <Tooltip title="Open in builder">
                        <IconButton size="small" onClick={() => navigate(`/workflow?open=${wfPreview.uuid}`)}>
                          <OpenInNewIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                      <ReactFlowProvider>
                        <ReactFlow
                          nodes={wfPreview.nodes}
                          edges={wfPreview.edges}
                          nodeTypes={WF_NODE_TYPES}
                          fitView
                          fitViewOptions={{ padding: 0.2 }}
                          nodesDraggable={false}
                          nodesConnectable={false}
                          elementsSelectable={false}
                          panOnDrag
                          zoomOnScroll={false}
                          proOptions={{ hideAttribution: true }}
                        >
                          <Background variant="dots" gap={14} size={1} />
                        </ReactFlow>
                      </ReactFlowProvider>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {/* LOGS — what this service actually did, on the same screen as what
                it is configured to do. */}
            <Accordion disableGutters elevation={0}
              expanded={logsOpen} onChange={(_e, v) => setLogsOpen(v)}
              sx={{ borderBottom: '1px solid var(--border-light, #e5e7eb)', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ArticleIcon sx={{ fontSize: 16 }} />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>Logs</Typography>
                  {logsLoading
                    ? <CircularProgress size={12} />
                    : <Chip label={logs.length} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.6rem' }} />}
                  <Tooltip title="Refresh">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); fetchLogs(); }}>
                      <RefreshIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0, maxHeight: 220, overflowY: 'auto' }}>
                {!logsLoading && logsError && (
                  <Alert severity="warning" sx={{ m: 1.5, py: 0.5 }}>
                    <Typography variant="caption">{logsError}</Typography>
                  </Alert>
                )}
                {!logsLoading && !logsError && logs.length === 0 && (
                  <Typography variant="caption" sx={{ display: 'block', p: 1.5, color: 'var(--text-secondary)' }}>
                    Nothing logged for this service in the window.
                  </Typography>
                )}
                {logs.map((l, i) => {
                  // Entries often carry no msg/level — the content lives in
                  // type/event_type and the data payload.
                  const when = l.time || l.timestamp || l.created_at || '';
                  const timeLabel = when.includes('T')
                    ? `${when.slice(0, 10)} ${when.slice(11, 19)}`
                    : when;
                  const kind = l.severity || l.level || l.action || l.type || l.event_type || '';
                  const message = l.message || l.msg || l.description
                    || (l.data && Object.keys(l.data).length
                      ? Object.entries(l.data).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')
                      : '');
                  return (
                    <Box key={l.event_id || l.id || `${when}-${i}`} sx={{
                      display: 'flex', gap: 1, px: 1.5, py: 0.5, fontFamily: 'monospace',
                      borderBottom: '1px solid var(--border-light, #f1f5f9)',
                    }}>
                      <Typography sx={{ fontSize: '0.62rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {timeLabel}
                      </Typography>
                      <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, flexShrink: 0,
                        color: /err|crit|fail/i.test(l.severity || l.level || '') ? '#ef4444' : 'var(--text-secondary)' }}>
                        {kind}
                      </Typography>
                      <Typography sx={{ fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={message}>
                        {message}
                      </Typography>
                    </Box>
                  );
                })}
              </AccordionDetails>
            </Accordion>

            {/* FLOW — down below, the whole flow, exactly as it was.
                Key includes the layout state so fitView re-runs when the
                config panel above mounts/unmounts. */}
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <ReactFlow
                key={`${selected.uuid}-${setup ? 'c' : ''}${wfPreview ? 'w' : ''}`}
                nodes={nodes}
                edges={edges}
                onNodeClick={onNodeClick}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                nodesDraggable
                nodesConnectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Controls showInteractive={false} />
                <Background variant="dots" gap={16} size={1} />
              </ReactFlow>
            </Box>
          </>
        )}
      </Box>

      {/* Easy add — the step-by-step Service wizard */}
      <ServiceWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        hookServiceTypes={serviceTypes}
        serviceTypeConfigs={typeConfigs}
        onSave={async (data) => { await servicesApi.create(data); setWizardOpen(false); fetchServices(); }}
      />

      {/* Edit existing service */}
      {editing && (
        <ServiceDialog
          open
          service={svc}
          hookServiceTypes={serviceTypes}
          onClose={() => setEditing(false)}
          onSave={async (data) => {
            await servicesApi.update(selected.uuid, data);
            setEditing(false);
            await fetchServices();
            await fetchFull();
          }}
        />
      )}

      {/* Attach a workflow to this service (workflow-mode services only) */}
      <Dialog open={attachOpen} onClose={() => setAttachOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Attach workflow</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
            This service listens for its triggers and routes matching events to the workflow(s) linked to it. Attach an existing workflow, or create a new one and build it.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel id="attach-wf-label">Existing workflow</InputLabel>
            <Select
              labelId="attach-wf-label"
              label="Existing workflow"
              value={pickWorkflow}
              onChange={(e) => setPickWorkflow(e.target.value)}
            >
              {envWorkflows
                .filter((w) => w.service_uuid !== selected?.uuid)
                .map((w) => (
                  <MenuItem key={w.uuid} value={w.uuid}>
                    {w.name}{w.service_uuid ? ' (linked elsewhere)' : ''}
                  </MenuItem>
                ))}
              {envWorkflows.filter((w) => w.service_uuid !== selected?.uuid).length === 0 && (
                <MenuItem disabled value="">No unlinked workflows in this application</MenuItem>
              )}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={createAndOpen} disabled={attaching} startIcon={attaching ? <CircularProgress size={16} /> : <AddIcon />} sx={{ textTransform: 'none', mr: 'auto' }}>
            Create new & build
          </Button>
          <Button onClick={() => setAttachOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button onClick={attachExisting} variant="contained" disabled={!pickWorkflow || attaching} sx={{ textTransform: 'none' }}>
            Attach
          </Button>
        </DialogActions>
      </Dialog>

      {/* Simulate a call/event through the service to see what runs */}
      <Dialog open={simOpen} onClose={() => setSimOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Simulate call</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
            Fire one of this service&apos;s trigger events (e.g. a call) through the pipeline and see what runs — the handler or its linked workflow.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mt: 1, mb: 2 }}>
            <InputLabel id="sim-event-label">Event</InputLabel>
            <Select labelId="sim-event-label" label="Event" value={simEvent} onChange={(e) => setSimEvent(e.target.value)}>
              {(svc?.triggers || []).map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              {(!svc?.triggers || svc.triggers.length === 0) && <MenuItem disabled value="">This service has no triggers</MenuItem>}
            </Select>
          </FormControl>
          <TextField
            label="Event data (JSON)"
            value={simData}
            onChange={(e) => setSimData(e.target.value)}
            fullWidth size="small" multiline minRows={2}
            sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
          />
          {simResult && (
            <Alert severity={simResult.error ? 'error' : 'success'} sx={{ mt: 2 }} onClose={() => setSimResult(null)}>
              {simResult.error ? (
                <Typography variant="caption">{simResult.error}</Typography>
              ) : (
                <Box>
                  <Typography variant="caption" fontWeight={700} display="block">Simulated: {simResult.event_name || simEvent}</Typography>
                  {(simResult.results || []).map((r, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                      <Chip label={r.status} size="small" color={r.status === 'success' ? 'success' : 'error'} sx={{ height: 18, fontSize: '0.6rem' }} />
                      <Typography variant="caption" fontFamily="monospace">{r.action || r.handler}{r.handler && r.action ? ` → ${r.handler}` : ''}</Typography>
                      {r.error && <Typography variant="caption" color="error.main">{r.error}</Typography>}
                    </Box>
                  ))}
                  {(!simResult.results || simResult.results.length === 0) && (
                    <Typography variant="caption">Event accepted. No handler/workflow output reported.</Typography>
                  )}
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSimOpen(false)} sx={{ textTransform: 'none' }}>Close</Button>
          <Button onClick={runSim} variant="contained" color="success" disabled={!simEvent || simRunning}
            startIcon={simRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />} sx={{ textTransform: 'none' }}>
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const ServicesStudio = () => (
  <ReactFlowProvider>
    <ServicesInner />
  </ReactFlowProvider>
);

export default ServicesStudio;
