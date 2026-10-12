import { useState, useEffect, useCallback } from 'react';
import { nodesApi } from '../services/api/nodesApi';

/**
 * useNodeHealth — one node's OWN health, as it answers `node:<uuid>:node.health`
 * over NATS (relayed by GET /api/nodes?action=connected). Feeds NodeHealthPanel.
 *
 * Not Gatus: Gatus runs on the mothership and watches the mothership, and the
 * per-node route that served it returned the same board for every node.
 *
 * LAZY: pass a falsy `nodeId` (e.g. until a node is selected) and it does
 * nothing — no request.
 *
 * @param {string|null} nodeId
 * @returns {{ row: Object|null, isHealthy: boolean|null, loading: boolean, error: string|null, refresh: Function }}
 */
export const useNodeHealth = (nodeId) => {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    if (!nodeId) return;
    setLoading(true);
    setError(null);
    try {
      setRow(await nodesApi.getNodeHealth(nodeId));
    } catch (err) {
      setError(err?.message || 'Health check failed');
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    if (nodeId) fetchHealth();
  }, [nodeId, fetchHealth]);

  const isHealthy = row ? !!(row.connected && row.ok) : (error ? false : null);
  return { row, isHealthy, loading, error, refresh: fetchHealth };
};

export default useNodeHealth;
