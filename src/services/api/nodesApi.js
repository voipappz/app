import apiService, { toFormData } from '../apiService';

// The API sends X-Total with both node lists, and apiService wraps an array
// that has one as { data, total }. The Nodes screen wants the rows, so both
// reads unwrap here; without it the screen showed "No nodes" over a full list.
const rowsOf = (r) => (Array.isArray(r) ? r : (r?.data ?? r?.nodes ?? []));

// Node writes are form-encoded, the API's convention (responses are JSON).
// toFormData drops an empty array, and an empty list cannot be form-encoded
// anyway, so a cleared interface list goes as a blank `sip_interfaces=`,
// which the API reads as "no interfaces".
const nodeForm = (data) => {
  const form = toFormData(data);
  if (Array.isArray(data?.sip_interfaces) && data.sip_interfaces.length === 0) {
    form.append('sip_interfaces', '');
  }
  // Same for roles: `roles[]=` (blank, dropped by the API) means none.
  if (Array.isArray(data?.roles) && data.roles.length === 0) {
    form.append('roles[]', '');
  }
  // toFormData skips a blank string, but a blank type is how it is cleared.
  if (data && data.type === '') form.append('type', '');
  return form;
};

/**
 * Nodes & Organization API Service — centralized access to node and organization data.
 *
 * Nodes are rows in the `nodes` table now, unioned with any node still declared
 * only in a node's va.yaml. Each one carries `source` ('database' | 'va.yaml')
 * and `editable`; only rows can be written, and importNodes() turns the va.yaml
 * ones into rows. Writes are root-only on the API (VA_ROOT).
 *
 * Backend endpoints:
 *   GET    /api/nodes               — the union: uuid, name, type, roles, notes, profile,
 *                                     sip_interfaces, source, editable, IPs
 *   GET    /api/nodes?action=connected — TABLE nodes only, each asked live over NATS:
 *                                     { uuid, name, connected, ok?, health?, reason? }
 *   POST   /api/nodes               — create (root)
 *   PATCH  /api/nodes/:uuid         — update (root)
 *   DELETE /api/nodes/:uuid         — soft delete (root)
 *   POST   /api/nodes/import        — import the va.yaml nodes as rows (root, idempotent)
 *   GET    /api/customers/nodes     — legacy read: uuid, name, type (kept as a fallback)
 *   GET    /api/customers/organization — name, language, timezone, color, logo_url, logo_icon, profile
 *   GET    /tasks/nodes             — uuid, name, type, roles, customer_uuid, IPs
 *   GET    /custom/nodes            — full Node#attributes dump
 */

export const nodesApi = {
  /**
   * Get all nodes with full details (primary endpoint).
   * /api/nodes is the only read that carries source/editable/profile.
   * @returns {Promise<Array>} - Array of node objects
   */
  getNodes: async () => {
    try {
      return rowsOf(await apiService.get('/api/nodes', {}, 'fetching nodes', false, true));
    } catch (err) {
      // Fall back ONLY when the route is genuinely absent. A bare catch here
      // treated 401 as "endpoint missing" and retried, and since apiService
      // calls authContextLogout() on every 401, one expired token bounced the
      // user to the login screen twice and issued a pointless second request.
      // 404/405 means "pre-nodes-table API"; anything else is the caller's.
      if (err?.status !== 404 && err?.status !== 405) throw err;
      // Pre-nodes-table API: no /api/nodes, and no source/editable/profile either.
      return rowsOf(await apiService.get('/api/customers/nodes', {}, 'fetching fallback nodes', false, true));
    }
  },

  /**
   * The choices a node's type and roles can take, from the API's own lists
   * (Node::TYPES, Node::ROLES). The node dialog fills its selects from this.
   * @returns {Promise<{types: string[], roles: string[]}>}
   */
  getNodeCatalog: async () => {
    return apiService.get('/api/nodes?action=types', {}, 'fetching node types', false, true);
  },

  /**
   * Which nodes are on the bus right now — one request for the whole fleet.
   *
   * The API asks every TABLE node for `node:<uuid>:node.health` over NATS in
   * parallel and answers within one timeout (~2s): `connected: true` carries
   * the node's own verdict (`ok`, `health`), `connected: false` carries a
   * `reason` — 'no responder' is the broker saying nobody is subscribed (instant),
   * 'timeout' is a node that is subscribed but silent. A bus that is down is
   * still a 200: every row is disconnected with the connect error as reason.
   *
   * `connected` and `ok` are two different facts: a node can be on the bus and
   * failing its own checks. Render both, never fold them.
   *
   * @returns {Promise<Array<{uuid: string, name: string, connected: boolean, ok?: boolean, health?: Object, reason?: string}>>}
   */
  getConnectedNodes: async () => {
    return rowsOf(await apiService.get('/api/nodes?action=connected', {}, 'fetching node bus status', false, true));
  },

  /**
   * Create a node. Root-only on the API (403 otherwise).
   * @param {{name: string, type?: string, notes?: string, roles?: string[], profile?: Object, uuid?: string, sip_interfaces?: Array}} node
   * @returns {Promise<Object>} - the created node
   */
  createNode: async (node) => {
    return apiService.post('/api/nodes', nodeForm(node), {}, 'creating node');
  },

  /**
   * Update a node. Root-only; a va.yaml node answers 406 until imported.
   * @param {string} uuid
   * @param {{name?: string, type?: string, notes?: string, roles?: string[], profile?: Object, sip_interfaces?: Array}} changes
   * @returns {Promise<Object>} - the updated node
   */
  updateNode: async (uuid, changes) => {
    return apiService.patch(`/api/nodes/${encodeURIComponent(uuid)}`, nodeForm(changes), {}, 'updating node');
  },

  /**
   * Replace a node's SIP interfaces.
   *
   * Interfaces live in the node's own `sip_interfaces` column (one flat hash
   * each: name, ip_address_internal, ip_address_external, port_internal,
   * port_external), not in its profile — the API moved them out of the
   * profile's sip_interface<n>.* keys. A PATCH with `sip_interfaces` replaces
   * the whole list, so pass every interface the node should end up with.
   * The derived keys GET adds (node_uuid, ip, port) are dropped here.
   * Root-only, like every node write.
   *
   * @param {string} uuid
   * @param {Array<Object>} interfaces
   * @returns {Promise<Object>} - the updated node, with sip_interfaces
   */
  setSipInterfaces: async (uuid, interfaces) => {
    const sipInterfaces = (interfaces || []).map((iface) =>
      Object.fromEntries(
        Object.entries(iface || {}).filter(
          ([k, v]) => !['node_uuid', 'ip', 'port'].includes(k) && v !== undefined && v !== null && v !== ''
        )
      )
    );
    return nodesApi.updateNode(uuid, { sip_interfaces: sipInterfaces });
  },

  /**
   * Soft delete a node. Root-only; refused (406) while customers are homed on it.
   * @param {string} uuid
   * @returns {Promise<Object>} - the deleted node
   */
  deleteNode: async (uuid) => {
    return apiService.delete(`/api/nodes/${encodeURIComponent(uuid)}`, {}, 'deleting node');
  },

  /**
   * Import every va.yaml node that is not a row yet, keeping its uuid.
   * Idempotent — a second call imports 0. Root-only.
   * @returns {Promise<{imported: number, nodes: Array}>}
   */
  importNodes: async () => {
    return apiService.post('/api/nodes/import', null, {}, 'importing nodes from va.yaml');
  },

  /**
   * Get a single node by UUID (filters from the full list)
   * @param {string} uuid - Node UUID
   * @returns {Promise<Object|null>} - Node object or null if not found
   */
  getNodeByUuid: async (uuid) => {
    const nodes = await nodesApi.getNodes();
    const list = Array.isArray(nodes) ? nodes : (nodes?.data || nodes?.items || []);
    return list.find(n => n.uuid === uuid) || null;
  },

  /**
   * Get all nodes — raw attributes from custom endpoint
   * Uses /custom/nodes which returns Node.all.map(&:attributes) including profile.
   * @returns {Promise<Array>} - Array of raw node attribute objects
   */
  getNodesRaw: async () => {
    return apiService.get('/custom/nodes');
  },

  /**
   * Get organization info (name, logo, timezone, etc.) from va.yaml
   * @returns {Promise<Object>} - Organization object
   */
  getOrganization: async () => {
    return apiService.get('/api/customers/organization');
  },

  /**
   * Get the complete va.yaml config document for a node (raw YAML text).
   * GET /api/customers/va_yaml/:node_uuid → application/yaml
   * @param {string} nodeUuid
   * @returns {Promise<string>} - YAML document
   */
  getVaYaml: async (nodeUuid) => {
    return apiService.getText(`/api/customers/va_yaml/${encodeURIComponent(nodeUuid)}`, 'va.yaml');
  },

  /**
   * One node's OWN health: its row from the fleet-wide NATS ask
   * (`getConnectedNodes`), i.e. what it answers on `node:<uuid>:node.health` —
   * `{ uuid, name, connected, ok?, health?: { statuses, metrics }, reason? }`.
   * Null when the API did not ask it (a node only in va.yaml has no row).
   *
   * Not GET /custom/nodes/:uuid/health: that answers with the MOTHERSHIP's
   * Gatus board whatever node is named, so every node showed the same tiles.
   *
   * @param {string} nodeId - Node uuid
   * @returns {Promise<Object|null>}
   */
  getNodeHealth: async (nodeId) => {
    const rows = await nodesApi.getConnectedNodes();
    return (Array.isArray(rows) ? rows : []).find((r) => r?.uuid === nodeId) || null;
  },
};

export default nodesApi;
