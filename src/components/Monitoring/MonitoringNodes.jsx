import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Chip, IconButton, Collapse, CircularProgress, Alert, Tooltip,
  Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import StorageIcon from '@mui/icons-material/Storage';
import RefreshIcon from '@mui/icons-material/Refresh';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import { nodesApi } from '../../services/api/nodesApi';
import { useAuth } from '../../context/AuthContext';
import NodeHealthPanel, { toNodeHealth } from './NodeHealthPanel.jsx';
import NodeEditDialog from './NodeEditDialog.jsx';
import { ConfirmDialog } from '../ui';

/**
 * MonitoringNodes — the list of nodes on the Monitoring page. Each node shows its
 * identity (name, type, IP, roles) and its OWN health: the report every node
 * answers on `node:<uuid>:node.health` over NATS — its checks (SIP, media,
 * control, license, system) and live metrics (calls, registrations, ...). ONE
 * request asks the whole fleet (GET /api/nodes?action=connected), so the status
 * dot and up-count show at a glance and expanding a node needs no second call.
 *
 * NOT Gatus. This screen used GET /custom/nodes/:uuid/health, which answers
 * with the MOTHERSHIP's Gatus board — Admin SPA, Kong, PgCat — under every
 * node's name. Gatus belongs on the Monitoring screen.
 *
 * This is also where nodes are MANAGED (/api/nodes CRUD). Nodes are deployment
 * infrastructure rather than tenant data — the va.yaml served to a node
 * configures every customer homed on it — so the API takes writes only from a
 * root account and the buttons follow: they render for root, and only on nodes
 * that are rows. A node still declared only in va.yaml shows a source chip and
 * is imported (POST /api/nodes/import) before it can be edited.
 */
export default function MonitoringNodes() {
  const { isRoot } = useAuth();
  const [nodes, setNodes] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);      // node being edited; null = create
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [versions, setVersions] = useState({}); // id -> version.json payload
  // Which nodes are on the NATS bus right now: uuid -> { connected, ok, reason }
  // from ONE GET /api/nodes?action=connected (the API asks every table node over
  // NATS in parallel), each connected row carrying the node's own report in
  // `health`. `connected` and `ok` stay two facts: a node can be on the bus and
  // failing its own checks.
  const [bus, setBus] = useState({ loading: false, rows: {}, error: null });
  const versionFiredRef = useRef(new Set());

  // Deployed build per node: nodes serve /version.json (like the admin build
  // does). Fetched straight from the node; silently absent if unreachable or
  // CORS-blocked — the chip just doesn't render.
  const fetchVersion = useCallback(async (node) => {
    const id = node.uuid || node.id || node.name;
    const host = node.domain || node.fqdn || node.name;
    if (!host || !/\./.test(String(host))) return; // need a resolvable hostname
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`https://${host}/version.json`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return;
      const v = await r.json();
      if (v && typeof v === 'object') setVersions((prev) => ({ ...prev, [id]: v }));
    } catch { /* unreachable / no version.json / CORS — no chip */ }
  }, []);

  useEffect(() => {
    nodes.filter((n) => n && n.name).forEach((node) => {
      const id = node.uuid || node.id || node.name;
      if (versionFiredRef.current.has(id)) return;
      versionFiredRef.current.add(id);
      fetchVersion(node);
    });
  }, [nodes, fetchVersion]);

  const loadBus = useCallback(async () => {
    setBus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const rows = await nodesApi.getConnectedNodes();
      const byUuid = {};
      (Array.isArray(rows) ? rows : []).forEach((r) => { if (r?.uuid) byUuid[r.uuid] = r; });
      setBus({ loading: false, rows: byUuid, error: null });
    } catch (e) {
      // The row chips just don't render; the list itself is unaffected.
      setBus({ loading: false, rows: {}, error: e?.message || 'Bus status unavailable' });
    }
  }, []);

  const loadNodes = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await nodesApi.getNodes();
      // Reloading nodes also re-asks every node (bus status + health) and versions
      versionFiredRef.current.clear();
      setVersions({});
      setNodes(Array.isArray(r) ? r : (r?.nodes || []));
      loadBus();
    } catch (e) {
      setError(e?.message || 'Failed to load nodes');
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [loadBus]);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  const idOf = (n) => n.uuid || n.id || n.name;

  // Only rows are writable. `editable` comes from the API; a pre-nodes-table API
  // (the getNodes fallback) sends neither field, so nothing claims to be editable.
  const isEditable = (n) => isRoot && n.editable === true;
  const hasYamlNodes = nodes.some((n) => n.source === 'va.yaml');

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (node) => { setEditing(node); setDialogOpen(true); };

  // Thrown back to the dialog, which renders the API's message (403 not root,
  // 406 duplicate name / va.yaml node, ...) next to the fields.
  const handleSave = async (payload) => {
    setSaving(true);
    setActionError(null);
    try {
      if (editing) {
        // uuid is the path, never a patchable field
        const { uuid: _uuid, ...changes } = payload;
        await nodesApi.updateNode(idOf(editing), changes);
      } else {
        await nodesApi.createNode(payload);
      }
      await loadNodes();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const node = confirmDelete;
    setConfirmDelete(null);
    setActionError(null);
    setActionMessage(null);
    try {
      await nodesApi.deleteNode(idOf(node));
      setActionMessage(`Deleted ${node.name}`);
      await loadNodes();
    } catch (e) {
      setActionError(e?.message || `Failed to delete ${node.name}`);
    }
  };

  const handleImport = async () => {
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await nodesApi.importNodes();
      const count = res?.imported ?? 0;
      setActionMessage(count > 0 ? `Imported ${count} node(s) from va.yaml` : 'Nothing left to import');
      await loadNodes();
    } catch (e) {
      setActionError(e?.message || 'Failed to import nodes');
    }
  };

  const toggle = (node) => {
    const id = idOf(node);
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
  };

  const statusDot = (node) => {
    // Grey while asking, or for a node the API does not ask (va.yaml only);
    // red when it does not answer or its own checks fail; green when all pass.
    const b = node.uuid ? bus.rows[node.uuid] : null;
    const color = bus.loading || !b ? '#bdbdbd' : b.connected && b.ok ? '#4caf50' : '#f44336';
    return <FiberManualRecordIcon sx={{ fontSize: 12, color }} />;
  };

  // "Is this node on the bus" — from the one fleet-wide NATS ask. No chip while
  // loading or for a node the API did not report (a va.yaml node has no row,
  // so the API never asks for it; importing it is what makes it reportable).
  const busChip = (node) => {
    const b = node.uuid ? bus.rows[node.uuid] : null;
    if (bus.loading || !b) return null;
    const sx = { height: 16, fontSize: '0.6rem' };
    if (!b.connected) {
      return (
        <Tooltip title={`Not answering on NATS — ${b.reason || 'unknown'}`}>
          <Chip size="small" label="off bus" sx={sx} data-testid={`node-bus-off-${node.uuid}`} />
        </Tooltip>
      );
    }
    // Connected and ok are two facts: on the bus, but its own checks may fail.
    return (
      <Tooltip title={b.ok ? 'Answering on NATS, all node checks up' : 'Answering on NATS, but the node reports failing checks'}>
        <Chip size="small" variant="outlined" color={b.ok ? 'success' : 'warning'}
          label={b.ok ? 'on bus' : 'on bus · degraded'} sx={sx} data-testid={`node-bus-on-${node.uuid}`} />
      </Tooltip>
    );
  };

  const busRows = Object.values(bus.rows);
  const busCounts = { total: busRows.length, connected: busRows.filter((r) => r.connected).length };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <StorageIcon fontSize="small" />
        <Typography sx={{ fontWeight: 600 }}>Nodes</Typography>
        <Chip size="small" variant="outlined" label={nodes.length} />
        {!bus.loading && busCounts.total > 0 && (
          <Tooltip title="Nodes answering on the NATS bus right now (table nodes only)">
            <Chip size="small" variant="outlined"
              color={busCounts.connected === busCounts.total ? 'success' : busCounts.connected === 0 ? 'default' : 'warning'}
              label={`${busCounts.connected}/${busCounts.total} on bus`} data-testid="nodes-bus-count" />
          </Tooltip>
        )}
        {bus.error && (
          <Tooltip title={bus.error}><Chip size="small" variant="outlined" label="bus status unavailable" /></Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        {isRoot && hasYamlNodes && (
          <Tooltip title="Copy the nodes declared in va.yaml into the database so they can be edited here">
            <Button size="small" startIcon={<DownloadIcon fontSize="small" />} onClick={handleImport} disabled={loading} data-testid="nodes-import">
              Import from va.yaml
            </Button>
          </Tooltip>
        )}
        {isRoot && (
          <Button size="small" variant="contained" startIcon={<AddIcon fontSize="small" />} onClick={openCreate} disabled={loading} data-testid="nodes-add">
            Add node
          </Button>
        )}
        <Tooltip title="Reload nodes">
          <IconButton size="small" onClick={loadNodes} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 1 }}>{error}</Alert>}
      {actionError && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setActionError(null)}>{actionError}</Alert>}
      {actionMessage && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setActionMessage(null)}>{actionMessage}</Alert>}
      {loading ? (
        <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={22} /></Box>
      ) : nodes.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No nodes.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {nodes.filter((n) => n && n.name).map((node) => {
            const id = idOf(node);
            const open = expanded === id;
            const row = node.uuid ? bus.rows[node.uuid] : null;
            const summary = row?.connected ? toNodeHealth(row.health).summary : null;
            return (
              <Box key={id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Box
                  onClick={() => toggle(node)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, cursor: 'pointer', '&:hover': { backgroundColor: 'var(--theme-hover)' } }}
                >
                  {statusDot(node)}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{node.name}</Typography>
                      {node.type && <Chip size="small" label={node.type} sx={{ height: 16, fontSize: '0.6rem' }} />}
                      {busChip(node)}
                      {versions[id] && (
                        <Tooltip title={`version.json: build ${versions[id].build || '?'} · ${versions[id].timestamp || ''}`}>
                          <Chip size="small" label={`v ${versions[id].commit || versions[id].build || versions[id].version}`}
                            sx={{ height: 16, fontSize: '0.6rem', fontFamily: 'monospace' }} />
                        </Tooltip>
                      )}
                      {summary && summary.total > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {summary.up}/{summary.total} up
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.1 }}>
                      {node.ip_address_internal && (
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{node.ip_address_internal}</Typography>
                      )}
                      {(node.roles || []).slice(0, 4).map((r) => (
                        <Chip key={r} size="small" label={r} sx={{ height: 14, fontSize: '0.55rem', bgcolor: 'var(--theme-bg-secondary)' }} />
                      ))}
                    </Box>
                  </Box>
                  {node.source === 'va.yaml' && (
                    <Tooltip title="Declared in this node's va.yaml — import it to edit it here">
                      <Chip size="small" variant="outlined" label="va.yaml" sx={{ height: 16, fontSize: '0.55rem' }} />
                    </Tooltip>
                  )}
                  {isEditable(node) && (
                    <>
                      <Tooltip title="Edit node">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); openEdit(node); }}
                          data-testid={`node-edit-${id}`}
                        >
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete node">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(node); }}
                          data-testid={`node-delete-${id}`}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </Box>

                <Collapse in={open} timeout="auto" unmountOnExit>
                  <Box sx={{ px: 1.5, pb: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ pt: 1.5 }}>
                      <NodeHealthPanel
                        title={`${node.name} · health`}
                        row={row}
                        loading={bus.loading}
                        error={bus.error}
                      />
                    </Box>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}

      <NodeEditDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        nodeData={editing}
        loading={saving}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete node"
        message={<Typography>Delete <strong>{confirmDelete?.name}</strong>?</Typography>}
        description="The row is soft deleted, so its uuid stays resolvable for historical calls. It is refused while customers are still homed on it."
        confirmTestId="node-delete-confirm"
      />
    </Box>
  );
}
